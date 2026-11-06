import type { CheckConstraintDiff } from './check-constraint-diff';
import type { FieldDiff } from './field-diff';
import type { IndexDiff } from './index-diff';
import type { RelationshipDiff } from './relationship-diff';
import type { TableDiff } from './table-diff';
import type { AreaDiff } from './area-diff';
import type { NoteDiff } from './note-diff';
import type {
    DBCheckConstraint,
    DBField,
    DBIndex,
    DBRelationship,
    DBTable,
    Area,
    Note,
} from '..';

export type DiagramDiff<
    TTable = DBTable,
    TField = DBField,
    TIndex = DBIndex,
    TCheckConstraint = DBCheckConstraint,
    TRelationship = DBRelationship,
    TArea = Area,
    TNote = Note,
> =
    | TableDiff<TTable>
    | FieldDiff<TField>
    | IndexDiff<TIndex>
    | CheckConstraintDiff<TCheckConstraint>
    | RelationshipDiff<TRelationship>
    | AreaDiff<TArea>
    | NoteDiff<TNote>;

export type DiffMap<
    TTable = DBTable,
    TField = DBField,
    TIndex = DBIndex,
    TCheckConstraint = DBCheckConstraint,
    TRelationship = DBRelationship,
    TArea = Area,
    TNote = Note,
> = Map<
    string,
    DiagramDiff<
        TTable,
        TField,
        TIndex,
        TCheckConstraint,
        TRelationship,
        TArea,
        TNote
    >
>;

export type DiffObject<
    TTable = DBTable,
    TField = DBField,
    TIndex = DBIndex,
    TCheckConstraint = DBCheckConstraint,
    TRelationship = DBRelationship,
    TArea = Area,
    TNote = Note,
> =
    | TableDiff<TTable>['object']
    | FieldDiff<TField>['object']
    | IndexDiff<TIndex>['object']
    | CheckConstraintDiff<TCheckConstraint>['object']
    | RelationshipDiff<TRelationship>['object']
    | AreaDiff<TArea>['object']
    | NoteDiff<TNote>['object'];

