import {describe, expect, it, vi} from 'vitest';

import type {CloudflareGate, CloudflareGateOptions, CloudflareGateRequest} from '../src';

import {createCloudflareGate} from '../src';

const CF_IPV4 = '104.16.0.1';
const CF_IPV6 = '2606:4700::1';
const OTHER_IPV4 = '203.0.113.1';
const OTHER_IPV6 = '2001:db8::1';

const createRequest = (
    path: string,
    headers: Record<string, string> = {},
    socket?: {remoteAddress?: string},
): CloudflareGateRequest => ({path, get: (name) => headers[name.toLowerCase()], socket});

// Simulates a JavaScript consumer, which the type system does not reach.
const untyped = (options: Record<string, unknown>): CloudflareGateOptions => options as CloudflareGateOptions;

const invoke = (gate: CloudflareGate, req: CloudflareGateRequest) => {
    const next = vi.fn();
    const sendStatus = vi.fn();

    gate.middleware(req, {sendStatus}, next);

    return {next, sendStatus};
};

const expectAllowed = ({next, sendStatus}: ReturnType<typeof invoke>): void => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(sendStatus).not.toHaveBeenCalled();
};

const expectForbidden = ({next, sendStatus}: ReturnType<typeof invoke>): void => {
    expect(sendStatus).toHaveBeenCalledTimes(1);
    expect(sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
};

describe('createCloudflareGate', () => {
    describe('factory contract', () => {
        it('should return a gate exposing middleware and isCloudflareAddress', () => {
            const gate = createCloudflareGate();

            expect(gate).toHaveProperty('middleware');
            expect(gate).toHaveProperty('isCloudflareAddress');
        });
    });

    describe('configuration', () => {
        it('should refuse a mistyped header name at construction', () => {
            const build = () => createCloudflareGate(untyped({header: 'fly-client-up'}));

            expect(build).toThrow(Error);
            expect(build).toThrow(
                '[@script-development/fs-cloudflare] header must be one of "fly-client-ip". Received: "fly-client-up"',
            );
        });

        it.each(['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'x-edge-ip', ''])(
            'should refuse the header %j, which no supported edge proxy is documented to overwrite',
            (header) => {
                expect(() => createCloudflareGate(untyped({header}))).toThrow('header must be one of');
            },
        );

        it('should accept the header name in any letter case', () => {
            const gate = createCloudflareGate(untyped({header: 'Fly-Client-IP'}));

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4})));
        });

        it.each(['Socket', 'tcp', 'headers'])('should refuse the unknown source %j at construction', (source) => {
            expect(() => createCloudflareGate(untyped({source}))).toThrow(
                `[@script-development/fs-cloudflare] source must be one of "header", "socket". Received: "${source}"`,
            );
        });

        it.each(['Allow', 'pass', 'open'])(
            'should refuse the unknown missingHeader policy %j at construction',
            (missingHeader) => {
                expect(() => createCloudflareGate(untyped({missingHeader}))).toThrow(
                    `[@script-development/fs-cloudflare] missingHeader must be one of "deny", "allow". Received: "${missingHeader}"`,
                );
            },
        );

        it.each([
            ['header', null, 'header must be one of "fly-client-ip". Received: null'],
            ['header', 42, 'header must be one of "fly-client-ip". Received: 42'],
            ['source', null, 'source must be one of "header", "socket". Received: null'],
            ['missingHeader', null, 'missingHeader must be one of "deny", "allow". Received: null'],
        ])('should refuse %s: %j instead of reading it as the default', (option, value, message) => {
            expect(() => createCloudflareGate(untyped({[option]: value}))).toThrow(
                `[@script-development/fs-cloudflare] ${message}`,
            );
        });

        it.each([[null], ['/health'], [['/health', 42]]])(
            'should refuse exemptPaths: %j at construction',
            (exemptPaths) => {
                expect(() => createCloudflareGate(untyped({exemptPaths}))).toThrow(
                    '[@script-development/fs-cloudflare] exemptPaths must be an array of strings',
                );
            },
        );

        it.each([null, 'warn', {}])('should refuse onMissingHeader: %j at construction', (onMissingHeader) => {
            expect(() => createCloudflareGate(untyped({onMissingHeader}))).toThrow(
                '[@script-development/fs-cloudflare] onMissingHeader must be a function',
            );
        });

        it('should read an option explicitly set to undefined as the default', () => {
            const gate = createCloudflareGate({
                exemptPaths: undefined,
                header: undefined,
                missingHeader: undefined,
                onMissingHeader: undefined,
                source: undefined,
            });

            expectForbidden(invoke(gate, createRequest('/')));
            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4}, {remoteAddress: CF_IPV4})));
            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4})));
        });

        it('should construct with every option at its documented value', () => {
            expect(() =>
                createCloudflareGate({
                    exemptPaths: ['/health'],
                    header: 'fly-client-ip',
                    missingHeader: 'allow',
                    onMissingHeader: () => undefined,
                    source: 'header',
                }),
            ).not.toThrow();
            expect(() => createCloudflareGate({source: 'socket', missingHeader: 'deny'})).not.toThrow();
        });
    });

    describe('header mode', () => {
        it('should pass a request from a Cloudflare IPv4 address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4})));
        });

        it('should pass a request from a Cloudflare IPv6 address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV6})));
        });

        it('should forbid a request from a non-Cloudflare IPv4 address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should forbid a request from a non-Cloudflare IPv6 address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV6})));
        });

        it('should pass an IPv4-mapped Cloudflare address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': `::ffff:${CF_IPV4}`})));
        });

        it('should forbid an IPv4-mapped non-Cloudflare address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': `::ffff:${OTHER_IPV4}`})));
        });

        it('should forbid a request whose client-IP header is not an address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': 'not-an-ip'})));
        });

        it('should read fly-client-ip by default, ignoring other client-IP headers', () => {
            const gate = createCloudflareGate();

            expectForbidden(
                invoke(gate, createRequest('/', {'cf-connecting-ip': CF_IPV4, 'fly-client-ip': OTHER_IPV4})),
            );
        });
    });

    describe('header mode, header absent', () => {
        it('should forbid a request without the client-IP header by default', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/')));
        });

        it('should report a request without the client-IP header and forbid it by default', () => {
            const onMissingHeader = vi.fn();
            const gate = createCloudflareGate({onMissingHeader});
            const req = createRequest('/jobs');

            expectForbidden(invoke(gate, req));
            expect(onMissingHeader).toHaveBeenCalledTimes(1);
            expect(onMissingHeader).toHaveBeenCalledWith(req);
        });

        it('should pass a request without the client-IP header only under the explicit allow opt-in', () => {
            const gate = createCloudflareGate({missingHeader: 'allow'});

            expectAllowed(invoke(gate, createRequest('/')));
        });

        it('should still report a request it passes under the allow opt-in', () => {
            const onMissingHeader = vi.fn();
            const gate = createCloudflareGate({missingHeader: 'allow', onMissingHeader});
            const req = createRequest('/');

            expectAllowed(invoke(gate, req));
            expect(onMissingHeader).toHaveBeenCalledTimes(1);
            expect(onMissingHeader).toHaveBeenCalledWith(req);
        });

        it('should not pass a request when the report callback throws, even under the allow opt-in', () => {
            const gate = createCloudflareGate({
                missingHeader: 'allow',
                onMissingHeader: () => {
                    throw new Error('logger down');
                },
            });
            const next = vi.fn();
            const sendStatus = vi.fn();

            expect(() => gate.middleware(createRequest('/'), {sendStatus}, next)).toThrow('logger down');
            expect(next).not.toHaveBeenCalled();
        });

        it.each(['allow', 'deny'] as const)(
            'should refuse an asynchronous reporter whose rejection would arrive after the decision (%s)',
            async (missingHeader) => {
                const gate = createCloudflareGate({
                    missingHeader,
                    onMissingHeader: async () => {
                        throw new Error('logger down');
                    },
                });
                const next = vi.fn();
                const sendStatus = vi.fn();

                expect(() => gate.middleware(createRequest('/'), {sendStatus}, next)).toThrow(
                    '[@script-development/fs-cloudflare] onMissingHeader must be synchronous: it returned a promise',
                );
                expect(next).not.toHaveBeenCalled();
                expect(sendStatus).not.toHaveBeenCalled();

                // The rejection must be handled by the gate: vitest fails the run on an unhandled one.
                await new Promise((resolve) => setTimeout(resolve, 0));
            },
        );

        it('should refuse a reporter returning a callable thenable', () => {
            // eslint-disable-next-line unicorn/no-thenable -- a function carrying `then` is the thenable shape under test
            const thenable = Object.assign(() => undefined, {then: (_: unknown, reject: () => void) => reject()});
            const gate = createCloudflareGate({missingHeader: 'allow', onMissingHeader: () => thenable as never});
            const next = vi.fn();

            expect(() => gate.middleware(createRequest('/'), {sendStatus: vi.fn()}, next)).toThrow(
                'onMissingHeader must be synchronous',
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should refuse an asynchronous reporter even when its promise resolves', () => {
            const gate = createCloudflareGate({missingHeader: 'allow', onMissingHeader: async () => undefined});
            const next = vi.fn();

            expect(() => gate.middleware(createRequest('/'), {sendStatus: vi.fn()}, next)).toThrow(Error);
            expect(next).not.toHaveBeenCalled();
        });

        it.each([null, 42, {}, () => undefined])(
            'should read a reporter return value of %j as synchronous',
            (returned) => {
                const gate = createCloudflareGate({missingHeader: 'allow', onMissingHeader: () => returned as never});

                expectAllowed(invoke(gate, createRequest('/')));
            },
        );

        it('should not report a request that carries the header, whatever its address', () => {
            const onMissingHeader = vi.fn();
            const gate = createCloudflareGate({onMissingHeader});

            invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4}));
            invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4}));

            expect(onMissingHeader).not.toHaveBeenCalled();
        });

        it('should not report or forbid an exempt path without the header', () => {
            const onMissingHeader = vi.fn();
            const gate = createCloudflareGate({exemptPaths: ['/health'], onMissingHeader});

            expectAllowed(invoke(gate, createRequest('/health')));
            expect(onMissingHeader).not.toHaveBeenCalled();
        });

        it('should not report in socket mode, which never reads the header', () => {
            const onMissingHeader = vi.fn();
            const gate = createCloudflareGate({source: 'socket', missingHeader: 'allow', onMissingHeader});

            expectForbidden(invoke(gate, createRequest('/', {}, {remoteAddress: OTHER_IPV4})));
            expect(onMissingHeader).not.toHaveBeenCalled();
        });
    });

    describe('exempt paths', () => {
        it('should pass an exempt path regardless of the client IP', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectAllowed(invoke(gate, createRequest('/health', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should forbid a non-exempt path from a non-Cloudflare IP', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectForbidden(invoke(gate, createRequest('/jobs', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should match exempt paths exactly, not by prefix', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectForbidden(invoke(gate, createRequest('/health/live', {'fly-client-ip': OTHER_IPV4})));
        });
    });

    describe('socket mode', () => {
        it('should pass a Cloudflare socket address while ignoring the header', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4}, {remoteAddress: CF_IPV4})));
        });

        it('should forbid a non-Cloudflare socket address even when the header holds a Cloudflare address', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4}, {remoteAddress: OTHER_IPV4})));
        });

        it('should forbid a socket without a remote address', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/', {}, {})));
        });

        it('should forbid a request carrying no socket at all', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/')));
        });
    });

    // The gate is built inside each case, never in a describe body: a factory call at collection
    // time makes Stryker classify every mutant it touches as static, and static mutants survive.
    describe('range boundaries', () => {
        it('should accept the first and last address of an IPv4 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('173.245.48.0')).toBe(true);
            expect(isCloudflareAddress('173.245.63.255')).toBe(true);
        });

        it('should reject the addresses adjacent to an IPv4 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('173.245.47.255')).toBe(false);
            expect(isCloudflareAddress('173.245.64.0')).toBe(false);
        });

        it('should accept the first and last address of an IPv6 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('2400:cb00::')).toBe(true);
            expect(isCloudflareAddress('2400:cb00:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
        });

        it('should reject the addresses adjacent to an IPv6 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('2400:caff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(false);
            expect(isCloudflareAddress('2400:cb01::')).toBe(false);
        });
    });
});
