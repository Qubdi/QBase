import type { Design } from '@/core/model/design';
import type { Memo } from '@/core/model/memo';
import type { Region } from '@/core/model/region';
import { listOf } from '@/core/model/collection';
import { nameMatches } from '@/features/tables/table-list';

/** Areas narrowed by the text in the filter box (EDT-208). */
export function listRegions(design: Design, text: string): Region[] {
    return listOf(design.regions).filter((r) => nameMatches(r.label, text));
}

/** The first line of a note's text: what its list row shows (EDT-214). */
export function firstLine(body: string): string {
    return body.split(/\r?\n/, 1)[0].trim();
}

/** Notes narrowed by the text in the filter box. */
export function listMemos(design: Design, text: string): Memo[] {
    return listOf(design.memos).filter((m) => nameMatches(m.body, text));
}
