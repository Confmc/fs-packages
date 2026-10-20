# fs-form — decisions

Why this package is shaped the way it is. Every entry names a cost it accepts or
a limitation it lives with, so the argument sits here rather than in a comment
nobody dates.

## D1 — The submit gate is a time window, not request identity

> **Superseded (control.9 experiment, 2026-10-09).** The form no longer listens on the service at
> all: `handleSubmit` takes the 422 its own action rejected with, and `take(error)` takes one caught
> elsewhere. That is request identity without a token — the cost is that an action which catches its
> own 422 must rethrow it or hand it to `take`. `onlyWhileSubmitting` and `acceptWhen` are gone.

_2026-10-03, fix round 3 on #283. Crit finding `d62f26db84c6`; follow-up row WR-1992._

`useForm`'s `onlyWhileSubmitting` takes a 422 only while the form's
`handleSubmit` is in flight. That is all it checks. The 422 middleware is
registered on a shared `HttpService`, and **any** request on that service that
answers 422 during the window lands in this form's bag and raises `refused`:
another form's submit, a background save, a dialog's request. What the option
does close is the idle case: a late 422 from a screen the user already left no
longer lands in a form that is not submitting.

**Why not real request identity.** The middleware receives the failed request's
`error.config`, but nothing ties a config to the form that sent it.

- **No async context bridges the `await`.** `handleSubmit` runs the consumer's
  action, and the action may await anything before it sends. When the request
  leaves, fs-form cannot see which submit started it.
- **A request middleware inside fs-form has the same window.** It could tag every
  request that leaves while `submitting` is true. But that test is exactly the
  gate's own test, so two requests in flight during one submit are tagged alike,
  and the foreign one still lands.

**What real identity would cost.** The consumer would have to thread a per-submit
marker into its request options — for example, `handleSubmit` handing the action
a token the action passes to `postRequest` — and fs-form would accept a 422 only
when `error.config` carries that form's marker. That is a consumer-visible API
change, held for a design ruling on WR-1992.

**Default:** off. Every 422 on the service binds unless the consumer opts in.

**Residual, stated as a contract:** with the option on, a foreign 422 that lands
during the submit is accepted. A spec in `tests/form.spec.ts` pins exactly that,
by name, so adding real identity turns it red on purpose and sends the author
here.
