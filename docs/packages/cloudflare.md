# fs-cloudflare

Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges.

```bash
npm install @script-development/fs-cloudflare
```

## What It Does

An app behind Cloudflare is only protected while traffic actually goes through Cloudflare. A bot that resolves the origin — the Fly anycast IP, the `*.fly.dev` hostname — reaches it directly and skips every WAF rule, rate limit and bot score. The gate 403s any request whose client IP is not a published Cloudflare egress address, which closes that direct-hit path.

The ranges are vendored, so the gate does no network I/O at runtime and the package has no dependencies at all.

## Threat Model

The check is "is this address a published Cloudflare egress address" — not "did this request come through _my_ Cloudflare zone". Those ranges are shared by every Cloudflare customer.

- **Closed:** direct hits on the origin — anycast IP, `*.fly.dev`, an origin IP recovered from DNS history or a certificate log.
- **Still open:** an attacker who knows the origin can point their own Cloudflare zone or Worker at it and arrive from a valid egress address, passing the gate while your zone's WAF, rate limits and bot rules never see the request.

Where that relay matters, authenticate the origin rather than range-matching it — Cloudflare Authenticated Origin Pulls (mTLS), or a shared secret injected by the zone's Transform Rule and verified at the origin. This gate composes with either; it does not replace them.

**What the gate trusts.** In `'header'` mode the gate is exactly as strong as the header it reads. It guarantees that a request whose proxy-written client-IP header is unparseable or outside the Cloudflare ranges is refused, and so is a request without the header unless you opt in. It guarantees nothing about a header a client can set: that header is a bypass, because the caller then declares their own address. So the header is not free text. Only names an edge proxy is documented to overwrite on every request are accepted, and an unknown name throws when the gate is built. A request without the header is reported to `onMissingHeader` and refused by default, because the gate cannot tell private-network traffic that never crossed the edge proxy from a proxy that stopped writing the header. Admitting that traffic is an explicit opt-in.

## Basic Usage

```typescript
import {createCloudflareGate} from '@script-development/fs-cloudflare';

const gate = createCloudflareGate({exemptPaths: ['/health']});

// Mount FIRST in the chain: a rejected request should cost nothing.
if (process.env.CLOUDFLARE_ONLY === 'true') app.use(gate.middleware);
```

The package has no enable flag and reads no environment — mounting _is_ the switch, so the kill switch stays where the platform config already lives.

## Options

| Option            | Default           | Meaning                                                                       |
| ----------------- | ----------------- | ----------------------------------------------------------------------------- |
| `exemptPaths`     | `[]`              | Paths that bypass the gate, matched exactly against `req.path`                |
| `header`          | `'fly-client-ip'` | Client-IP header read in `'header'` mode; only `'fly-client-ip'` is accepted  |
| `missingHeader`   | `'deny'`          | `'deny'` or `'allow'`: what a `'header'`-mode request without the header gets |
| `onMissingHeader` | none              | Called with the request for every `'header'`-mode request without the header  |
| `source`          | `'header'`        | Where the client IP comes from: `'header'` or `'socket'`                      |

An unrecognised `header`, `source` or `missingHeader` throws when the gate is built: each of them chooses between a closed and an open gate, so a typo must not reach a request.

`exemptPaths` has no default on purpose: probe paths differ per app (`/healthcheck`, `/health`, …). Exempt yours — a platform health probe reaches the machine directly and never passes Cloudflare, so gating it 403s every probe and stalls deploys.

## Choosing a Source

| Topology                                | `source`   | Compared against           |
| --------------------------------------- | ---------- | -------------------------- |
| Fly (fly-proxy in front)                | `'header'` | `Fly-Client-IP`            |
| Node terminating TCP directly, no proxy | `'socket'` | `req.socket.remoteAddress` |

In `'header'` mode the header must be one the platform edge proxy writes from the TCP peer and overwrites per request. Pointing the gate at a client-suppliable header is not a configuration choice, it is a bypass, which is why `header` accepts a fixed set of names (only `fly-client-ip` today). Supporting another platform's proxy means adding its header to that set, with the proxy's documented overwrite guarantee as the justification. There is deliberately no fallback chain across several headers: each candidate is only trustworthy on its own platform, and `CF-Connecting-IP` holds the _end user's_ address rather than Cloudflare's egress address.

A missing header is refused and reported. The request came over the private network (Fly 6PN) or through a proxy that no longer writes the header, and the gate cannot tell the two apart, so by default it 403s and calls `onMissingHeader(req)` first. Wire that callback to your logger. Health probes are covered by `exemptPaths` and never reported; local development needs no opt-in because the gate is only mounted where you switch it on. If private-network callers must reach gated paths, pass `missingHeader: 'allow'`: those requests then pass and are still reported. A reporter that throws admits nothing.

`'socket'` mode compares the TCP peer, ignores the header options, and fails closed when there is no peer address. It is only correct while Node holds the public listener — behind a load balancer the peer is that balancer and the gate 403s everything.

An unparseable address fails closed in both modes.

## API

`createCloudflareGate(options?)` returns:

- `middleware(req, res, next)` — Express 4/5 compatible handler; calls `next()` or `res.sendStatus(403)`.
- `isCloudflareAddress(value)` — the range check on its own, for health endpoints or diagnostics.

Request and response are duck-typed (`req.path`, `req.get()`, `req.socket`, `res.sendStatus()`), so the package needs no Express dependency and no peer range to widen when Express majors.

## Refreshing the Ranges

```bash
node scripts/update-cf-ranges.mjs   # from the repo root
```

Rewrites `packages/cloudflare/src/ranges.ts` from Cloudflare's published endpoints, leaving it byte-identical when nothing changed. The scheduled `cf-ranges-drift` workflow runs it weekly and fails on drift; the fix is to commit the regenerated file and release a new version, which consumers pick up with a dependency bump.
