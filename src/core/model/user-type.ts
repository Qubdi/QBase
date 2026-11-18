import type { ExtraKeys, TypeRef } from './column';
import type { Id } from './id';

export type UserTypeKind = 'enum' | 'composite' | 'alias';

export interface CompositeMember {
    name: string;
    /** the member's type, as text */
    type: string;
}

/** An enum, composite or alias type declared in the database. */
export interface UserType {
    id: Id;
    schema?: string;
    name: string;
    kind: UserTypeKind;
    /** enum labels, in order */
    values?: string[];
    /** composite members, in order */
    members?: CompositeMember[];
    /** alias types (SQL Server): the type it is made from, as text, e.g. `varchar(11)` */
    base?: string;
    extra?: ExtraKeys;
}

/** A column that uses a custom type stores the type's name as both id and name (DAT-039). */
export function typeRefOfUserType(type: Pick<UserType, 'name'>): TypeRef {
    return { id: type.name, name: type.name };
}
