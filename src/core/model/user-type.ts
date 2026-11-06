import type { ExtraKeys, TypeRef } from './column';
import type { Id } from './id';

export type UserTypeKind = 'enum' | 'composite';

export interface CompositeMember {
    name: string;
    /** the member's type, as text */
    type: string;
}

/** An enum or composite type declared in the database. */
export interface UserType {
    id: Id;
    schema?: string;
    name: string;
    kind: UserTypeKind;
    /** enum labels, in order */
    values?: string[];
    /** composite members, in order */
    members?: CompositeMember[];
    extra?: ExtraKeys;
}

/** A column that uses a custom type stores the type's name as both id and name (DAT-039). */
export function typeRefOfUserType(type: Pick<UserType, 'name'>): TypeRef {
    return { id: type.name, name: type.name };
}
