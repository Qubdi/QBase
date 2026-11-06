import type { Column } from '../model/column';
import type { Design } from '../model/design';
import type { Dependency } from '../model/dependency';
import type { Entity } from '../model/entity';
import type { EntityParts } from '../model/entity-parts';
import type { Id } from '../model/id';
import type { Key } from '../model/key';
import type { Link } from '../model/link';
import type { Memo } from '../model/memo';
import type { Region } from '../model/region';
import type { Rule } from '../model/rule';
import type { UserType } from '../model/user-type';

/**
 * A change to apply to a record: the keys listed take the given values; a key
 * set to `undefined` is removed from the record.
 */
export type Patch<T> = { [K in keyof Omit<T, 'id'>]?: T[K] | undefined };

export type EntityPatch = Patch<
    Omit<Entity, 'columnIds' | 'keyIds' | 'ruleIds'>
>;

/** Records that live inside an entity. */
export interface PartRecords {
    columns: Column;
    keys: Key;
    rules: Rule;
}
export type PartName = keyof PartRecords;

/** Flat collections of the design. */
export interface ItemRecords {
    links: Link;
    userTypes: UserType;
    regions: Region;
    memos: Memo;
}
export type ItemName = keyof ItemRecords;

/** A record together with its position in a list, for exact restoring. */
export interface Placed<T> {
    item: T;
    index: number;
}

export interface Move {
    id: Id;
    x: number;
    y: number;
}

type PartCommand<K extends PartName> =
    | {
          type: 'part.insert';
          entityId: Id;
          part: K;
          item: PartRecords[K];
          at?: number;
      }
    | { type: 'part.remove'; entityId: Id; part: K; id: Id }
    | {
          type: 'part.update';
          entityId: Id;
          part: K;
          id: Id;
          patch: Patch<PartRecords[K]>;
      }
    | { type: 'part.reorder'; entityId: Id; part: K; ids: Id[] };

type ItemCommand<K extends ItemName> =
    | { type: 'item.insert'; collection: K; item: ItemRecords[K]; at?: number }
    | { type: 'item.remove'; collection: K; id: Id }
    | {
          type: 'item.update';
          collection: K;
          id: Id;
          patch: Patch<ItemRecords[K]>;
      }
    | { type: 'item.reorder'; collection: K; ids: Id[] };

/**
 * The closed set of edits. Every change to a design is one of these; `apply`
 * turns a command into the next design and the command that undoes it.
 */
export type Command =
    | { type: 'design.rename'; name: string }
    | { type: 'design.replace'; design: Design }
    | { type: 'group'; commands: Command[]; label?: string }
    | {
          type: 'entity.insert';
          parts: EntityParts;
          at?: number;
          /** used when restoring a deleted entity */
          links?: Placed<Link>[];
          dependencies?: Placed<Dependency>[];
      }
    | { type: 'entity.remove'; id: Id }
    | { type: 'entity.update'; id: Id; patch: EntityPatch }
    | { type: 'entity.move'; moves: Move[] }
    | { type: 'entity.reorder'; ids: Id[] }
    /** puts an entity and its own records back exactly as captured */
    | { type: 'entity.restore'; parts: EntityParts }
    | PartCommand<'columns'>
    | PartCommand<'keys'>
    | PartCommand<'rules'>
    | ItemCommand<'links'>
    | ItemCommand<'userTypes'>
    | ItemCommand<'regions'>
    | ItemCommand<'memos'>;

export type CommandType = Command['type'];

export type FailureReason = 'read-only' | 'not-found' | 'invalid' | 'duplicate';

export type ApplyResult =
    | {
          ok: true;
          design: Design;
          /** the command that undoes this one */
          inverse: Command;
          /** false when the command changed nothing */
          changed: boolean;
      }
    | { ok: false; reason: FailureReason; message: string };

export interface ApplyOptions {
    /** refuse every command (viewer, compare view) */
    readOnly?: boolean;
    /** "now" in ms for `updatedAt`; defaults to the clock */
    now?: number;
}
