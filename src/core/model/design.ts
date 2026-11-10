import type { Collection } from './collection';
import type { Column, ExtraKeys } from './column';
import type { DatabaseEdition, DatabaseType } from './database';
import type { Dependency } from './dependency';
import type { Entity } from './entity';
import type { Id } from './id';
import type { Key } from './key';
import type { Link } from './link';
import type { Memo } from './memo';
import type { Region } from './region';
import type { Rule } from './rule';
import type { UserType } from './user-type';
import type { VisibilityFilter } from './visibility-filter';

/** The whole diagram: one immutable value. Dates are milliseconds. */
export interface Design {
    id: Id;
    name: string;
    databaseType: DatabaseType;
    databaseEdition?: DatabaseEdition;
    createdAt: number;
    updatedAt: number;
    /** the order of this collection is the side-list order of tables */
    entities: Collection<Entity>;
    columns: Readonly<Record<Id, Column>>;
    keys: Readonly<Record<Id, Key>>;
    rules: Readonly<Record<Id, Rule>>;
    links: Collection<Link>;
    userTypes: Collection<UserType>;
    regions: Collection<Region>;
    memos: Collection<Memo>;
    /** legacy view dependencies, carried unchanged */
    dependencies: readonly Dependency[];
    /**
     * Which tables are shown on the canvas. Saved with the diagram, so it
     * survives a refresh and travels with the file. Absent means all shown.
     */
    filter?: VisibilityFilter;
    extra?: ExtraKeys;
}
