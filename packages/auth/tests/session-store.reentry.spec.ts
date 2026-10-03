import type {ResponseErrorMiddlewareFunc} from '@script-development/fs-http';

import {appendFileSync} from 'node:fs';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {watch} from 'vue';

import type {SessionState, SessionStore} from '../src';
import type {HttpStub} from './support/http-stub';

import {createSessionStore, registerUnauthorizedMiddleware, sanctumEndpoints} from '../src';
import {axiosRejection, createHttpStub, respondWith} from './support/http-stub';

/**
 * The re-entry table (WR-1610). Every row is one operation in flight, one place
 * where consumer code runs synchronously inside it, and one thing that consumer
 * code does. The expected outcome of each row comes from the oracle below, which
 * reasons about what each operation DECIDED and never about how the store writes
 * it — so a row is red when the store lets a consumer see, or act on, anything
 * other than a decided state.
 *
 * P1: an operation answers its own outcome. A read answers the state it decided,
 * or `undefined` when a newer read or a sign-out overtook it.
 * P2: no observer ever sees `authenticated` without a user or `signed_out` /
 * `loading` with one, a session-end event is delivered exactly once per session
 * that ended and never for one the machine then revives, and the machine ends
 * where the last-issued operation says.
 */

interface User {
    id: number;
}

interface Credentials {
    id: number;
}

type Server = {kind: 'live'; user: User} | {kind: 'none'} | {kind: 'garbled'} | {kind: 'unreachable'};

type Pre = 'loading' | 'authenticated' | 'signed_out' | 'outage';

type Site = 'parseUser' | 'state' | 'user' | 'isAuthenticated' | 'pair' | 'listener' | 'middleware';

type Action = 'none' | 'loadSession' | 'login' | 'logout' | 'expire' | 'setUser';

type OpName =
    | 'load-good'
    | 'load-bad-body'
    | 'load-401'
    | 'load-outage'
    | 'login-confirm'
    | 'logout-2xx'
    | 'logout-401'
    | 'expiry';

interface Snapshot {
    state: SessionState;
    user: User | undefined;
}

interface Operation {
    name: OpName;
    pre: Pre;
    /** The server the operation's own request meets. */
    server: Server;
    /** What the operation decides, absent any re-entry. */
    decided: Snapshot;
    /** What the operation answers its caller, absent any re-entry. */
    answer: unknown;
    isRead: boolean;
}

const ENDPOINTS = sanctumEndpoints('auth/test');
const OTHER_URL = 'api/other';
const PRE_USER: User = {id: 7};
const SET_USER: User = {id: 42};
const INNER_LOGIN: Credentials = {id: 3};
const OUTER_LOGIN: Credentials = {id: 5};
const GONE = {message: 'gone'};
const GARBLED = {unexpected: true};

const isUser = (body: unknown): User | undefined =>
    typeof body === 'object' && body !== null && typeof (body as User).id === 'number' ? (body as User) : undefined;

const preSnapshot = (pre: Pre): Snapshot =>
    pre === 'authenticated' || pre === 'outage' ? {state: pre, user: PRE_USER} : {state: pre, user: undefined};

const holds = (snapshot: Snapshot): boolean => snapshot.state === 'authenticated' || snapshot.state === 'outage';

const readOf = (server: Server, retained: User | undefined): {snapshot: Snapshot; answer: unknown} => {
    switch (server.kind) {
        case 'live':
            return {
                snapshot: {state: 'authenticated', user: server.user},
                answer: {state: 'authenticated', status: 200, body: server.user},
            };
        case 'none':
            return {
                snapshot: {state: 'signed_out', user: undefined},
                answer: {state: 'signed_out', status: 401, body: GONE},
            };
        case 'garbled':
            return {snapshot: {state: 'outage', user: retained}, answer: {state: 'outage', status: 200, body: GARBLED}};
        case 'unreachable':
            return {
                snapshot: {state: 'outage', user: retained},
                answer: {state: 'outage', status: undefined, body: undefined},
            };
    }
};

const loadOp = (name: OpName, pre: Pre, server: Server): Operation => {
    const read = readOf(server, preSnapshot(pre).user);

    return {name, pre, server, decided: read.snapshot, answer: read.answer, isRead: true};
};

const SIGNED_OUT: Snapshot = {state: 'signed_out', user: undefined};

const OPERATIONS: Operation[] = [
    loadOp('load-good', 'loading', {kind: 'live', user: {id: 9}}),
    loadOp('load-good', 'authenticated', {kind: 'live', user: {id: 9}}),
    loadOp('load-bad-body', 'loading', {kind: 'garbled'}),
    loadOp('load-bad-body', 'authenticated', {kind: 'garbled'}),
    loadOp('load-401', 'loading', {kind: 'none'}),
    loadOp('load-401', 'authenticated', {kind: 'none'}),
    loadOp('load-outage', 'loading', {kind: 'unreachable'}),
    loadOp('load-outage', 'authenticated', {kind: 'unreachable'}),
    {
        name: 'login-confirm',
        pre: 'signed_out',
        server: {kind: 'none'},
        decided: {state: 'authenticated', user: {id: OUTER_LOGIN.id}},
        answer: {kind: 'authenticated'},
        isRead: false,
    },
    {
        name: 'logout-2xx',
        pre: 'authenticated',
        server: {kind: 'live', user: PRE_USER},
        decided: SIGNED_OUT,
        answer: {kind: 'signed_out'},
        isRead: false,
    },
    {
        name: 'logout-401',
        pre: 'authenticated',
        server: {kind: 'none'},
        decided: SIGNED_OUT,
        answer: {kind: 'signed_out'},
        isRead: false,
    },
    {
        name: 'expiry',
        pre: 'authenticated',
        server: {kind: 'none'},
        decided: SIGNED_OUT,
        answer: undefined,
        isRead: false,
    },
    {name: 'expiry', pre: 'outage', server: {kind: 'none'}, decided: SIGNED_OUT, answer: undefined, isRead: false},
];

const SITES: Site[] = ['parseUser', 'state', 'user', 'isAuthenticated', 'pair', 'listener', 'middleware'];
const ACTIONS: Action[] = ['none', 'loadSession', 'login', 'logout', 'expire', 'setUser'];

/** Sites that run BEFORE the operation's decision; every other site runs inside or after it. */
const isBeforeSite = (site: Site): boolean => site === 'parseUser' || site === 'middleware';

const sameUser = (a: User | undefined, b: User | undefined): boolean => a?.id === b?.id;

/** Why a tuple cannot happen, or `undefined` when it can. */
const pruneReason = (op: Operation, site: Site, action: Action): string | undefined => {
    const before = preSnapshot(op.pre);
    const after = op.decided;
    const answersBody = op.server.kind === 'live' || op.server.kind === 'garbled';
    const rejects = op.server.kind === 'none' || op.server.kind === 'unreachable';

    if (site === 'parseUser' && !(answersBody && (op.isRead || op.name === 'login-confirm')))
        return 'parseUser runs only on a me answering a body';
    if (site === 'state' && before.state === after.state) return 'the machine does not move';
    if (site === 'user' && sameUser(before.user, after.user)) return 'the identity does not change';
    if (site === 'isAuthenticated' && (before.state === 'authenticated') === (after.state === 'authenticated'))
        return 'isAuthenticated does not flip';
    if (site === 'pair' && before.state === after.state && sameUser(before.user, after.user))
        return 'neither half of the pair moves';
    if (site === 'listener' && !(holds(before) && after.state === 'signed_out')) return 'no session ends';
    if (
        site === 'middleware' &&
        !(op.name === 'expiry' || (rejects && op.name !== 'logout-2xx' && op.name !== 'login-confirm'))
    )
        return 'nothing is refused';
    if (action === 'setUser') {
        const met = isBeforeSite(site) ? before : after;

        if (met.state !== 'authenticated') return 'setUser throws by contract outside authenticated (D3)';
    }

    return undefined;
};

interface Expectation {
    final: Snapshot;
    outer: unknown[];
    inner: unknown[] | undefined;
}

/** The server once the operation's own request has been answered — what a re-entrant request meets. */
const serverAfter = (op: Operation): Server => {
    if (op.name === 'login-confirm') return {kind: 'live', user: {id: OUTER_LOGIN.id}};
    if (op.name === 'logout-2xx') return {kind: 'none'};

    return op.server;
};

/** The oracle: what each row must end at, and what each caller must be told. */
const expectationFor = (op: Operation, site: Site, action: Action): Expectation => {
    const before = isBeforeSite(site);
    const met = before ? preSnapshot(op.pre) : op.decided;
    const endsAtMeeting = action === 'expire' && holds(met);
    const takesTicketBeforeDecision = before && (action === 'loadSession' || endsAtMeeting);
    const sessionEndsAfter = before && (op.name === 'logout-401' || op.name === 'expiry');

    let outer: unknown[] = [op.answer];

    if (op.isRead && takesTicketBeforeDecision) outer = [undefined];
    else if (op.isRead && (action === 'loadSession' || endsAtMeeting)) outer = [op.answer, undefined];

    const serverForInner = serverAfter(op);
    const decidedUser = action === 'setUser' && before ? SET_USER : op.decided.user;
    const decided: Snapshot = op.decided.state === 'outage' ? {state: 'outage', user: decidedUser} : op.decided;

    switch (action) {
        case 'none':
            return {final: decided, outer, inner: undefined};
        case 'setUser':
            return {final: before ? decided : {state: 'authenticated', user: SET_USER}, outer, inner: undefined};
        case 'expire':
            return {final: endsAtMeeting ? SIGNED_OUT : decided, outer, inner: undefined};
        case 'loadSession': {
            const read = readOf(serverForInner, decided.user);

            return {final: read.snapshot, outer, inner: sessionEndsAfter ? [read.answer, undefined] : [read.answer]};
        }
        case 'login':
            return serverForInner.kind === 'unreachable'
                ? {final: decided, outer, inner: [{kind: 'refused', status: undefined, body: undefined}]}
                : {final: {state: 'authenticated', user: INNER_LOGIN}, outer, inner: [{kind: 'authenticated'}]};
        case 'logout':
            return serverForInner.kind === 'unreachable'
                ? {final: decided, outer, inner: [{kind: 'failed', status: undefined, body: undefined}]}
                : {final: SIGNED_OUT, outer, inner: [{kind: 'signed_out'}]};
    }
};

type Timeline = ({kind: 'state'; from: SessionState; to: SessionState} | {kind: 'event'} | {kind: 'me'})[];

interface Harness {
    store: SessionStore<User, Credentials>;
    http: HttpStub;
    server: {current: Server};
    timeline: Timeline;
    violations: string[];
    events: unknown[];
    onParse: {current: (() => void) | undefined};
    refuseOther: () => Promise<void>;
}

const tick = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

const settle = async (): Promise<void> => {
    for (let index = 0; index < 10; index += 1) await tick();
};

const answerLater = async <T>(produce: () => T): Promise<T> => {
    await Promise.resolve();

    return produce();
};

const buildHarness = (): Harness => {
    const http = createHttpStub();
    const server: {current: Server} = {current: {kind: 'none'}};
    const timeline: Timeline = [];
    const onParse: {current: (() => void) | undefined} = {current: undefined};

    const refuse = (status: number | undefined, data: unknown, url: string): never => {
        const error = axiosRejection(status, data, url);

        for (const middleware of http.errorMiddleware)
            middleware(error as unknown as Parameters<ResponseErrorMiddlewareFunc>[0]);

        throw error;
    };

    const store = createSessionStore<User, Credentials>({
        guard: 'test',
        http,
        endpoints: ENDPOINTS,
        parseUser: (body) => {
            const fire = onParse.current;

            onParse.current = undefined;
            fire?.();

            return isUser(body);
        },
        timeoutMs: 1000,
    });

    (http.getRequest as unknown as {mockImplementation: (fn: (url: string) => unknown) => void}).mockImplementation(
        (url: string) => {
            timeline.push({kind: 'me'});

            return answerLater(() => {
                const now = server.current;

                if (now.kind === 'unreachable') return refuse(undefined, undefined, url);
                if (now.kind === 'none') return refuse(401, GONE, url);
                if (now.kind === 'garbled') return respondWith({...GARBLED});

                return respondWith({...now.user});
            });
        },
    );

    (
        http.postRequest as unknown as {mockImplementation: (fn: (url: string, body: unknown) => unknown) => void}
    ).mockImplementation((url: string, body: unknown) =>
        answerLater(() => {
            const now = server.current;

            if (now.kind === 'unreachable') return refuse(undefined, undefined, url);

            if (url === ENDPOINTS.login) {
                server.current = {kind: 'live', user: {id: (body as Credentials).id}};

                return respondWith({});
            }

            if (now.kind === 'live') {
                server.current = {kind: 'none'};

                return respondWith('');
            }

            return refuse(401, GONE, url);
        }),
    );

    const violations: string[] = [];
    const events: unknown[] = [];

    return {
        store,
        http,
        server,
        timeline,
        violations,
        events,
        onParse,
        refuseOther: () =>
            answerLater(() => {
                refuse(401, GONE, OTHER_URL);
            }).catch(() => undefined),
    };
};

const enterPreState = async (harness: Harness, pre: Pre): Promise<void> => {
    const {server, store} = harness;

    if (pre === 'loading') return;

    if (pre === 'signed_out') {
        server.current = {kind: 'none'};
        await store.loadSession();
    } else {
        server.current = {kind: 'live', user: {...PRE_USER}};
        await store.loadSession();
    }

    if (pre === 'outage') {
        server.current = {kind: 'unreachable'};
        await store.loadSession();
    }

    if (store.state.value !== pre) throw new Error(`could not enter ${pre}, machine reads ${store.state.value}`);
};

/** Watches every synchronous moment the machine exposes and records what it may never show. */
const installProbe = (harness: Harness): void => {
    const {store, timeline, violations} = harness;

    const check = (where: string) => {
        const state = store.state.value;
        const user = store.user.value;

        if (state === 'authenticated' && user === undefined)
            violations.push(`P2 torn at ${where}: authenticated, no user`);
        if ((state === 'signed_out' || state === 'loading') && user !== undefined)
            violations.push(`P2 torn at ${where}: ${state} with user ${JSON.stringify(user)}`);
    };

    watch(
        store.state,
        (to, from) => {
            timeline.push({kind: 'state', from, to});
            check('state watcher');
        },
        {flush: 'sync'},
    );
    watch(store.user, () => check('user watcher'), {flush: 'sync'});
    store.onSessionEnd((event) => {
        timeline.push({kind: 'event'});
        harness.events.push(event);
        check('session-end listener');
    });
};

const checkTimeline = (harness: Harness): void => {
    const {timeline, violations} = harness;
    const endings = timeline.filter(
        (entry) =>
            entry.kind === 'state' &&
            entry.to === 'signed_out' &&
            (entry.from === 'authenticated' || entry.from === 'outage'),
    ).length;
    const events = timeline.filter((entry) => entry.kind === 'event').length;

    if (endings !== events) violations.push(`P2 events: ${events} delivered for ${endings} sessions ended`);

    let sinceEvent: 'none' | 'event' | 'event+me' = 'none';

    for (const entry of timeline) {
        if (entry.kind === 'event') sinceEvent = 'event';
        else if (entry.kind === 'me' && sinceEvent === 'event') sinceEvent = 'event+me';
        else if (entry.kind === 'state' && entry.to === 'authenticated' && sinceEvent === 'event')
            violations.push('P2 revived: authenticated after a session-end event with no read issued since');
    }
};

interface Row {
    id: string;
    op: Operation;
    site: Site;
    action: Action;
}

const rowId = (op: Operation, site: Site, action: Action): string => `${op.name}@${op.pre} | ${site} | ${action}`;

const generated: Row[] = [];
const pruned = new Map<string, number>();

for (const op of OPERATIONS) {
    for (const site of SITES) {
        for (const action of ACTIONS) {
            const reason = pruneReason(op, site, action);

            if (reason === undefined) generated.push({id: rowId(op, site, action), op, site, action});
            else pruned.set(reason, (pruned.get(reason) ?? 0) + 1);
        }
    }
}

const GENERATED_COUNT = OPERATIONS.length * SITES.length * ACTIONS.length;

/** Rows red on the design they run against. Every one is a finding (WR-1610). */
const RED_ROWS = new Set<string>([
    'load-good@loading | parseUser | none',
    'load-good@loading | parseUser | loadSession',
    'load-good@loading | parseUser | login',
    'load-good@loading | parseUser | logout',
    'load-good@loading | parseUser | expire',
    'load-good@loading | state | none',
    'load-good@loading | state | loadSession',
    'load-good@loading | state | login',
    'load-good@loading | state | logout',
    'load-good@loading | state | expire',
    'load-good@loading | state | setUser',
    'load-good@loading | user | none',
    'load-good@loading | user | loadSession',
    'load-good@loading | user | login',
    'load-good@loading | user | logout',
    'load-good@loading | user | expire',
    'load-good@loading | user | setUser',
    'load-good@loading | isAuthenticated | none',
    'load-good@loading | isAuthenticated | loadSession',
    'load-good@loading | isAuthenticated | login',
    'load-good@loading | isAuthenticated | logout',
    'load-good@loading | isAuthenticated | expire',
    'load-good@loading | isAuthenticated | setUser',
    'load-good@loading | pair | none',
    'load-good@loading | pair | loadSession',
    'load-good@loading | pair | login',
    'load-good@loading | pair | logout',
    'load-good@loading | pair | expire',
    'load-good@loading | pair | setUser',
    'load-good@authenticated | parseUser | logout',
    'load-good@authenticated | parseUser | expire',
    'load-good@authenticated | user | logout',
    'load-good@authenticated | user | expire',
    'load-good@authenticated | pair | logout',
    'load-good@authenticated | pair | expire',
    'load-bad-body@authenticated | parseUser | logout',
    'load-bad-body@authenticated | parseUser | expire',
    'load-bad-body@authenticated | state | logout',
    'load-bad-body@authenticated | state | expire',
    'load-bad-body@authenticated | isAuthenticated | logout',
    'load-bad-body@authenticated | isAuthenticated | expire',
    'load-bad-body@authenticated | pair | logout',
    'load-bad-body@authenticated | pair | expire',
    'load-401@loading | state | login',
    'load-401@loading | pair | login',
    'load-401@loading | middleware | login',
    'load-401@authenticated | state | none',
    'load-401@authenticated | state | loadSession',
    'load-401@authenticated | state | login',
    'load-401@authenticated | state | logout',
    'load-401@authenticated | state | expire',
    'load-401@authenticated | user | none',
    'load-401@authenticated | user | loadSession',
    'load-401@authenticated | user | login',
    'load-401@authenticated | user | logout',
    'load-401@authenticated | user | expire',
    'load-401@authenticated | isAuthenticated | none',
    'load-401@authenticated | isAuthenticated | loadSession',
    'load-401@authenticated | isAuthenticated | login',
    'load-401@authenticated | isAuthenticated | logout',
    'load-401@authenticated | isAuthenticated | expire',
    'load-401@authenticated | pair | none',
    'load-401@authenticated | pair | loadSession',
    'load-401@authenticated | pair | login',
    'load-401@authenticated | pair | logout',
    'load-401@authenticated | pair | expire',
    'load-401@authenticated | listener | none',
    'load-401@authenticated | listener | loadSession',
    'load-401@authenticated | listener | login',
    'load-401@authenticated | listener | logout',
    'load-401@authenticated | listener | expire',
    'load-401@authenticated | middleware | none',
    'load-401@authenticated | middleware | loadSession',
    'load-401@authenticated | middleware | login',
    'load-401@authenticated | middleware | logout',
    'load-401@authenticated | middleware | expire',
    'load-401@authenticated | middleware | setUser',
    'load-outage@authenticated | state | expire',
    'load-outage@authenticated | isAuthenticated | expire',
    'load-outage@authenticated | pair | expire',
    'load-outage@authenticated | middleware | expire',
    'login-confirm@signed_out | state | none',
    'login-confirm@signed_out | state | loadSession',
    'login-confirm@signed_out | state | login',
    'login-confirm@signed_out | state | logout',
    'login-confirm@signed_out | state | expire',
    'login-confirm@signed_out | state | setUser',
    'login-confirm@signed_out | user | none',
    'login-confirm@signed_out | user | loadSession',
    'login-confirm@signed_out | user | login',
    'login-confirm@signed_out | user | logout',
    'login-confirm@signed_out | user | expire',
    'login-confirm@signed_out | user | setUser',
    'login-confirm@signed_out | isAuthenticated | none',
    'login-confirm@signed_out | isAuthenticated | loadSession',
    'login-confirm@signed_out | isAuthenticated | login',
    'login-confirm@signed_out | isAuthenticated | logout',
    'login-confirm@signed_out | isAuthenticated | expire',
    'login-confirm@signed_out | isAuthenticated | setUser',
    'login-confirm@signed_out | pair | none',
    'login-confirm@signed_out | pair | loadSession',
    'login-confirm@signed_out | pair | login',
    'login-confirm@signed_out | pair | logout',
    'login-confirm@signed_out | pair | expire',
    'login-confirm@signed_out | pair | setUser',
    'logout-2xx@authenticated | state | none',
    'logout-2xx@authenticated | state | loadSession',
    'logout-2xx@authenticated | state | login',
    'logout-2xx@authenticated | state | logout',
    'logout-2xx@authenticated | state | expire',
    'logout-2xx@authenticated | user | none',
    'logout-2xx@authenticated | user | loadSession',
    'logout-2xx@authenticated | user | login',
    'logout-2xx@authenticated | user | logout',
    'logout-2xx@authenticated | user | expire',
    'logout-2xx@authenticated | isAuthenticated | none',
    'logout-2xx@authenticated | isAuthenticated | loadSession',
    'logout-2xx@authenticated | isAuthenticated | login',
    'logout-2xx@authenticated | isAuthenticated | logout',
    'logout-2xx@authenticated | isAuthenticated | expire',
    'logout-2xx@authenticated | pair | none',
    'logout-2xx@authenticated | pair | loadSession',
    'logout-2xx@authenticated | pair | login',
    'logout-2xx@authenticated | pair | logout',
    'logout-2xx@authenticated | pair | expire',
    'logout-2xx@authenticated | listener | none',
    'logout-2xx@authenticated | listener | loadSession',
    'logout-2xx@authenticated | listener | login',
    'logout-2xx@authenticated | listener | logout',
    'logout-2xx@authenticated | listener | expire',
    'logout-401@authenticated | state | none',
    'logout-401@authenticated | state | loadSession',
    'logout-401@authenticated | state | login',
    'logout-401@authenticated | state | logout',
    'logout-401@authenticated | state | expire',
    'logout-401@authenticated | user | none',
    'logout-401@authenticated | user | loadSession',
    'logout-401@authenticated | user | login',
    'logout-401@authenticated | user | logout',
    'logout-401@authenticated | user | expire',
    'logout-401@authenticated | isAuthenticated | none',
    'logout-401@authenticated | isAuthenticated | loadSession',
    'logout-401@authenticated | isAuthenticated | login',
    'logout-401@authenticated | isAuthenticated | logout',
    'logout-401@authenticated | isAuthenticated | expire',
    'logout-401@authenticated | pair | none',
    'logout-401@authenticated | pair | loadSession',
    'logout-401@authenticated | pair | login',
    'logout-401@authenticated | pair | logout',
    'logout-401@authenticated | pair | expire',
    'logout-401@authenticated | listener | none',
    'logout-401@authenticated | listener | loadSession',
    'logout-401@authenticated | listener | login',
    'logout-401@authenticated | listener | logout',
    'logout-401@authenticated | listener | expire',
    'logout-401@authenticated | middleware | none',
    'logout-401@authenticated | middleware | loadSession',
    'logout-401@authenticated | middleware | login',
    'logout-401@authenticated | middleware | logout',
    'logout-401@authenticated | middleware | expire',
    'logout-401@authenticated | middleware | setUser',
    'expiry@authenticated | state | none',
    'expiry@authenticated | state | loadSession',
    'expiry@authenticated | state | login',
    'expiry@authenticated | state | logout',
    'expiry@authenticated | state | expire',
    'expiry@authenticated | user | none',
    'expiry@authenticated | user | loadSession',
    'expiry@authenticated | user | login',
    'expiry@authenticated | user | logout',
    'expiry@authenticated | user | expire',
    'expiry@authenticated | isAuthenticated | none',
    'expiry@authenticated | isAuthenticated | loadSession',
    'expiry@authenticated | isAuthenticated | login',
    'expiry@authenticated | isAuthenticated | logout',
    'expiry@authenticated | isAuthenticated | expire',
    'expiry@authenticated | pair | none',
    'expiry@authenticated | pair | loadSession',
    'expiry@authenticated | pair | login',
    'expiry@authenticated | pair | logout',
    'expiry@authenticated | pair | expire',
    'expiry@authenticated | listener | none',
    'expiry@authenticated | listener | loadSession',
    'expiry@authenticated | listener | login',
    'expiry@authenticated | listener | logout',
    'expiry@authenticated | listener | expire',
    'expiry@authenticated | middleware | none',
    'expiry@authenticated | middleware | loadSession',
    'expiry@authenticated | middleware | login',
    'expiry@authenticated | middleware | logout',
    'expiry@authenticated | middleware | expire',
    'expiry@authenticated | middleware | setUser',
    'expiry@outage | state | none',
    'expiry@outage | state | loadSession',
    'expiry@outage | state | login',
    'expiry@outage | state | logout',
    'expiry@outage | state | expire',
    'expiry@outage | user | none',
    'expiry@outage | user | loadSession',
    'expiry@outage | user | login',
    'expiry@outage | user | logout',
    'expiry@outage | user | expire',
    'expiry@outage | pair | none',
    'expiry@outage | pair | loadSession',
    'expiry@outage | pair | login',
    'expiry@outage | pair | logout',
    'expiry@outage | pair | expire',
    'expiry@outage | listener | none',
    'expiry@outage | listener | loadSession',
    'expiry@outage | listener | login',
    'expiry@outage | listener | logout',
    'expiry@outage | listener | expire',
    'expiry@outage | middleware | none',
    'expiry@outage | middleware | loadSession',
    'expiry@outage | middleware | login',
    'expiry@outage | middleware | logout',
    'expiry@outage | middleware | expire',
]);

const runAction = (harness: Harness, action: Action, record: (inner: Promise<unknown>) => void): void => {
    const {store} = harness;

    try {
        switch (action) {
            case 'none':
                return;
            case 'loadSession':
                return record(store.loadSession());
            case 'login':
                return record(store.login({...INNER_LOGIN}));
            case 'logout':
                return record(store.logout());
            case 'expire':
                return store.handleSessionExpired('/inner');
            case 'setUser':
                return store.setUser({...SET_USER});
        }
    } catch (error) {
        harness.violations.push(`P1 re-entrant ${action} threw: ${String(error)}`);
    }
};

const runOperation = (harness: Harness, op: Operation): Promise<unknown> => {
    const {store} = harness;

    if (op.isRead) return store.loadSession();
    if (op.name === 'login-confirm') return store.login({...OUTER_LOGIN});
    if (op.name === 'logout-2xx' || op.name === 'logout-401') return store.logout();

    return harness.refuseOther();
};

const runRow = async (row: Row): Promise<string[]> => {
    const {op, site, action} = row;
    const harness = buildHarness();
    const {store, http, violations} = harness;
    let armed = false;
    let fired = false;
    let inner: Promise<unknown> | undefined;

    const fire = () => {
        if (!armed) return;

        armed = false;
        fired = true;
        runAction(harness, action, (promise) => {
            inner = promise;
        });
    };

    if (site === 'middleware') http.registerResponseErrorMiddleware(() => fire());
    registerUnauthorizedMiddleware(http, store, {returnTo: () => '/here'});

    await enterPreState(harness, op.pre);

    installProbe(harness);

    if (site === 'parseUser') harness.onParse.current = fire;
    if (site === 'state') watch(store.state, fire, {flush: 'sync'});
    if (site === 'user') watch(store.user, fire, {flush: 'sync'});
    if (site === 'isAuthenticated') watch(store.isAuthenticated, fire, {flush: 'sync'});
    if (site === 'pair') watch([store.state, store.user], fire, {flush: 'sync'});
    if (site === 'listener') store.onSessionEnd(fire);

    harness.server.current = op.server;
    armed = true;

    let outerAnswer: unknown;

    try {
        outerAnswer = await runOperation(harness, op);
    } catch (error) {
        violations.push(`P1 operation threw: ${String(error)}`);
    }

    let innerAnswer: unknown;

    if (inner !== undefined) {
        try {
            innerAnswer = await inner;
        } catch (error) {
            violations.push(`P1 re-entrant ${action} rejected: ${String(error)}`);
        }
    }

    await settle();

    if (!fired) violations.push('instrument: the re-entry site never fired');

    const expected = expectationFor(op, site, action);

    if (!expected.outer.some((candidate) => JSON.stringify(candidate) === JSON.stringify(outerAnswer)))
        violations.push(
            `P1 operation answered ${JSON.stringify(outerAnswer)}, expected ${JSON.stringify(expected.outer)}`,
        );

    if (
        expected.inner !== undefined &&
        !expected.inner.some((candidate) => JSON.stringify(candidate) === JSON.stringify(innerAnswer))
    )
        violations.push(
            `P1 re-entrant ${action} answered ${JSON.stringify(innerAnswer)}, expected ${JSON.stringify(expected.inner)}`,
        );

    const final = {state: store.state.value, user: store.user.value};

    if (final.state !== expected.final.state || !sameUser(final.user, expected.final.user))
        violations.push(`P2 ended at ${JSON.stringify(final)}, last-issued says ${JSON.stringify(expected.final)}`);

    checkTimeline(harness);

    return violations;
};

const results = new Map<string, string[]>();

describe('session store re-entry table (WR-1610)', () => {
    it('generates, prunes and runs a stated population', () => {
        const prunedCount = [...pruned.values()].reduce((sum, count) => sum + count, 0);

        expect(generated.length).toBeGreaterThan(0);
        expect(generated.length + prunedCount).toBe(GENERATED_COUNT);
        expect([...RED_ROWS].filter((id) => !generated.some((row) => row.id === id))).toEqual([]);
    });

    const run = async (id: string, row: Row): Promise<void> => {
        const violations = await runRow(row);

        results.set(id, violations);
        expect(violations).toEqual([]);
    };

    const green = generated.filter((row) => !RED_ROWS.has(row.id)).map((row) => [row.id, row] as const);
    const red = generated.filter((row) => RED_ROWS.has(row.id)).map((row) => [row.id, row] as const);

    if (green.length > 0) it.each(green)('%s', run);
    if (red.length > 0) it.fails.each(red)('%s', run);

    afterAll(() => {
        const red = [...results].filter(([, violations]) => violations.length > 0);
        const lines = [
            `re-entry table: ${GENERATED_COUNT} generated, ${GENERATED_COUNT - generated.length} pruned, ${generated.length} run, ${red.length} red`,
            ...[...pruned].map(([reason, count]) => `  pruned ${count}: ${reason}`),
            ...red.map(([id, violations]) => `  RED ${id} :: ${violations.join(' ; ')}`),
        ];

        if (process.env.REENTRY_REPORT !== undefined)
            appendFileSync(process.env.REENTRY_REPORT, `${lines.join('\n')}\n`);
    });
});

/** Every distinct state the machine passes through, as a sync watcher on `state` alone sees it. */
const stateTrail = (store: SessionStore<User, Credentials>): SessionState[] => {
    const trail: SessionState[] = [];

    watch(store.state, (next) => trail.push(next), {flush: 'sync'});

    return trail;
};

/** Rows red on the design they run against, among the consumer-shape and WR-1442 rows. */
const RED_SHAPES = new Set<string>([
    'employer mirror | expiry@authenticated',
    'employer mirror | expiry@outage',
    'employer mirror | load-401@authenticated',
    'employer mirror | load-good@loading',
    'employer mirror | login-confirm@signed_out',
    'employer mirror | logout-2xx@authenticated',
    'employer mirror | logout-401@authenticated',
]);

const shapeIt = (name: string, body: () => Promise<void>) =>
    RED_SHAPES.has(name) ? it.fails(name, body) : it(name, body);

const employerFires = new Map<string, number>();

describe('consumer shapes (lokalekeuze, ^0.2.0)', () => {
    describe('employer store: watch([state, user]) mirroring the machine', () => {
        for (const op of OPERATIONS) {
            const name = `employer mirror | ${op.name}@${op.pre}`;

            shapeIt(name, async () => {
                const harness = buildHarness();
                const {store} = harness;

                registerUnauthorizedMiddleware(harness.http, store, {returnTo: () => '/here'});
                await enterPreState(harness, op.pre);

                const trail = stateTrail(store);
                const start = store.state.value;
                const mirrored: SessionState[] = [];
                const torn: string[] = [];
                let generation = 0;

                watch(
                    [store.state, store.user],
                    ([next, user]) => {
                        generation += 1;
                        mirrored.push(next);

                        if ((next === 'authenticated') !== (user !== undefined) && next !== 'outage')
                            torn.push(`${next} with user ${JSON.stringify(user)}`);
                    },
                    {flush: 'sync'},
                );

                harness.server.current = op.server;
                await runOperation(harness, op);
                await settle();

                employerFires.set(`${op.name}@${op.pre}`, generation);

                expect(torn).toEqual([]);
                expect(
                    mirrored.filter((state, index) => state !== (index === 0 ? start : mirrored[index - 1])),
                ).toEqual(trail);
            });
        }
    });

    describe('merchant store: an onSessionEnd listener read after `await logout()`', () => {
        it.each([
            ['2xx', {kind: 'live', user: {id: 7}} as Server, {reason: 'logout'}],
            ['401', {kind: 'none'} as Server, {reason: 'expired'}],
        ])('has run before the caller resumes, on a %s logout', async (_status, server, expected) => {
            const harness = buildHarness();
            const {store} = harness;
            let lastEnd: unknown;

            await enterPreState(harness, 'authenticated');
            store.onSessionEnd((event) => {
                lastEnd = event;
            });
            harness.server.current = server;

            await store.logout();

            expect(lastEnd).toEqual(expected);
        });
    });

    describe('session-expiry: assign() on an expired session-end', () => {
        const scenarios: [string, Pre, (harness: Harness) => Promise<unknown>][] = [
            ['a refused request from authenticated', 'authenticated', (harness) => harness.refuseOther()],
            ['a refused request from outage', 'outage', (harness) => harness.refuseOther()],
            [
                'two refused requests in one tick',
                'authenticated',
                (harness) => Promise.all([harness.refuseOther(), harness.refuseOther()]),
            ],
            ['a revalidating me answering 401', 'authenticated', (harness) => harness.store.loadSession()],
            ['a logout answering 401', 'authenticated', (harness) => harness.store.logout()],
        ];

        it.each(scenarios)('fires exactly once for %s', async (_name, pre, provoke) => {
            const harness = buildHarness();
            const {store} = harness;
            let assigned = 0;

            registerUnauthorizedMiddleware(harness.http, store, {returnTo: () => '/here'});
            await enterPreState(harness, pre);
            store.onSessionEnd((event) => {
                if (event.reason === 'expired') assigned += 1;
            });
            harness.server.current = {kind: 'none'};

            await provoke(harness);
            await settle();

            expect(assigned).toBe(1);
        });
    });

    afterAll(() => {
        if (process.env.REENTRY_REPORT === undefined) return;

        appendFileSync(
            process.env.REENTRY_REPORT,
            `${['employer watcher fires per operation:', ...[...employerFires].map(([op, n]) => `  ${op}: ${n}`)].join('\n')}\n`,
        );
    });
});

describe('WR-1442: an older logout answering after a newer login (observed, not required)', () => {
    // Red on purpose: WR-1442 is deferred (D18 b). The row records the defect; it does not gate it.
    it.fails.each([
        ['2xx', undefined],
        ['401', 401],
    ])('leaves the machine on the login when the logout answers %s last', async (_label, status) => {
        const http = createHttpStub();
        const store = createSessionStore<User, Credentials>({
            guard: 'test',
            http,
            endpoints: ENDPOINTS,
            parseUser: isUser,
            timeoutMs: 1000,
        });
        let answerLogout: () => void = () => undefined;

        vi.mocked(http.getRequest)
            .mockResolvedValueOnce(respondWith({id: 7}))
            .mockResolvedValueOnce(respondWith({id: 3}));
        vi.mocked(http.postRequest)
            .mockReturnValueOnce(
                new Promise((resolve, reject) => {
                    answerLogout = () =>
                        status === undefined ? resolve(respondWith('')) : reject(axiosRejection(status));
                }),
            )
            .mockResolvedValueOnce(respondWith({}));

        await store.loadSession();

        const logout = store.logout();
        const login = await store.login({id: 3});

        expect(login).toEqual({kind: 'authenticated'});

        answerLogout();
        await logout;

        expect(store.state.value).toBe('authenticated');
        expect(store.user.value).toEqual({id: 3});
    });
});
