import {BlockList, isIPv4, isIPv6} from 'node:net';

import type {
    CloudflareGate,
    CloudflareGateHeader,
    CloudflareGateMissingHeader,
    CloudflareGateOptions,
    CloudflareGateRequest,
    CloudflareGateResponse,
    CloudflareGateSource,
} from './types';

import {CLOUDFLARE_IPV4, CLOUDFLARE_IPV6} from './ranges';

const HTTP_FORBIDDEN = 403;

const HEADERS: readonly CloudflareGateHeader[] = ['fly-client-ip'];
const SOURCES: readonly CloudflareGateSource[] = ['header', 'socket'];
const MISSING_HEADER_POLICIES: readonly CloudflareGateMissingHeader[] = ['deny', 'allow'];

// The options reach JavaScript consumers unchecked, and every one of them selects between a closed and
// an open gate, so an unrecognised value throws here instead of degrading at request time.
const oneOf = <T extends string>(option: string, allowed: readonly T[], value: string): T => {
    const match = allowed.find((candidate) => candidate === value);
    if (match !== undefined) return match;

    const expected = allowed.map((candidate) => JSON.stringify(candidate)).join(', ');
    throw new Error(
        `[@script-development/fs-cloudflare] ${option} must be one of ${expected}. Received: ${JSON.stringify(value)}`,
    );
};

const addSubnets = (blockList: BlockList, ranges: string[], family: 'ipv4' | 'ipv6'): void => {
    for (const range of ranges) {
        const separator = range.indexOf('/');
        blockList.addSubnet(range.slice(0, separator), Number(range.slice(separator + 1)), family);
    }
};

const buildBlockList = (): BlockList => {
    const blockList = new BlockList();
    addSubnets(blockList, CLOUDFLARE_IPV4, 'ipv4');
    addSubnets(blockList, CLOUDFLARE_IPV6, 'ipv6');

    return blockList;
};

export const createCloudflareGate = (options: CloudflareGateOptions = {}): CloudflareGate => {
    const header = oneOf('header', HEADERS, (options.header ?? 'fly-client-ip').toLowerCase());
    const readSocket = oneOf('source', SOURCES, options.source ?? 'header') === 'socket';
    const admitMissingHeader =
        oneOf('missingHeader', MISSING_HEADER_POLICIES, options.missingHeader ?? 'deny') === 'allow';
    const {onMissingHeader} = options;
    const exemptPaths = new Set(options.exemptPaths);
    const blockList = buildBlockList();

    const isCloudflareAddress = (value: string): boolean => {
        // An IPv4-mapped IPv6 address (::ffff:1.2.3.4) needs no unwrapping: BlockList matches it
        // against the v4 rules itself. The IPv4-mapped cases in the spec pin that.
        if (isIPv4(value)) return blockList.check(value, 'ipv4');

        return isIPv6(value) && blockList.check(value, 'ipv6');
    };

    const passes = (req: CloudflareGateRequest): boolean => {
        // Socket mode has no proxy in front: an absent peer address is unknowable, so it fails closed.
        if (readSocket) {
            const address = req.socket?.remoteAddress;

            return address !== undefined && isCloudflareAddress(address);
        }

        const address = req.get(header);

        // Absence looks the same whether the request came over a private network or the proxy stopped
        // writing the header, so it is reported before the policy decides, and a throwing reporter admits nothing.
        if (address === undefined) {
            onMissingHeader?.(req);

            return admitMissingHeader;
        }

        return isCloudflareAddress(address);
    };

    const middleware = (req: CloudflareGateRequest, res: CloudflareGateResponse, next: () => void): void => {
        if (exemptPaths.has(req.path) || passes(req)) {
            next();

            return;
        }

        res.sendStatus(HTTP_FORBIDDEN);
    };

    return {middleware, isCloudflareAddress};
};
