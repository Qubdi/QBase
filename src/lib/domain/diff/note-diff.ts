import type { Note } from '../note';

export type NoteDiffAttribute = keyof Pick<
    Note,
    'content' | 'color' | 'x' | 'y' | 'width' | 'height'
>;

export interface NoteDiffChanged {
    object: 'note';
    type: 'changed';
    noteId: string;
    newNoteId: string;
    attribute: NoteDiffAttribute;
    oldValue?: string | number | null;
    newValue?: string | number | null;
}

export interface NoteDiffRemoved {
    object: 'note';
    type: 'removed';
    noteId: string;
}

export interface NoteDiffAdded<T = Note> {
    object: 'note';
    type: 'added';
    noteAdded: T;
}

export type NoteDiff<T = Note> =
    NoteDiffChanged | NoteDiffRemoved | NoteDiffAdded<T>;
