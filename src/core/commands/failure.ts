import type { FailureReason } from './command';

/** Thrown inside `apply` and turned into a refusal result at its edge. */
export class CommandError extends Error {
    constructor(
        readonly reason: FailureReason,
        message: string
    ) {
        super(message);
        this.name = 'CommandError';
    }
}

export function fail(reason: FailureReason, message: string): never {
    throw new CommandError(reason, message);
}
