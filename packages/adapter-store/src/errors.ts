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
        const expected = handler === 'onUpdate' ? 'an object with a numeric `id`' : 'a numeric id';
        super(
            `${domainName} broadcast ${handler} received an invalid payload — expected ${expected}, got ${typeof received}. The store rejects it rather than corrupting state.`,
        );
        this.name = 'BroadcastPayloadError';
    }
}
