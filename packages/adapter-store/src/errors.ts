export class EntryNotFoundError extends Error {
    constructor(domainName: string, id: number) {
        super(`${domainName} with id ${id} not found`);
        this.name = 'EntryNotFoundError';
    }
}

export class MissingResponseDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingResponseDataError';
    }
}

export class BroadcastPayloadError extends Error {
    constructor(domainName: string, handler: 'onUpdate' | 'onDelete', received: unknown) {
        const expected = handler === 'onUpdate' ? 'an object with an integer `id`' : 'an integer id';
        super(
            `${domainName} broadcast ${handler} received an invalid payload — expected ${expected}, got ${typeof received}. The store rejects it rather than corrupting state.`,
        );
        this.name = 'BroadcastPayloadError';
    }
}

export class ExtendKeyCollisionError extends Error {
    constructor(key: string) {
        super(
            `extend() returned the key "${key}", which collides with a built-in store method. extend keys must be new names.`,
        );
        this.name = 'ExtendKeyCollisionError';
    }
}

export class ExtendPayloadError extends Error {
    constructor(domainName: string, mutator: 'setById' | 'deleteById', received: unknown) {
        const expected = mutator === 'setById' ? 'an object with an integer `id`' : 'an integer id';
        super(
            `${domainName} extend ${mutator} received an invalid payload — expected ${expected}, got ${typeof received}. The store rejects it rather than corrupting state.`,
        );
        this.name = 'ExtendPayloadError';
    }
}
