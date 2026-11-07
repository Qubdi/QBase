import type { Design } from '@/core/model/design';
import { listOf } from '@/core/model/collection';
import type { UserType } from '@/core/model/user-type';
import { nameMatches } from '@/features/tables/table-list';

/** Custom types narrowed by the text in the filter box (EDT-188). */
export function listUserTypes(design: Design, text: string): UserType[] {
    return listOf(design.userTypes).filter((t) => nameMatches(t.name, text));
}

/** Enum values with `value` added: blank and repeated values are refused (EDT-192). */
export function withEnumValue(
    values: readonly string[],
    value: string
): string[] | undefined {
    const next = value.trim();
    if (next === '' || values.includes(next)) return undefined;
    return [...values, next];
}

export function withoutEnumValue(
    values: readonly string[],
    value: string
): string[] {
    return values.filter((v) => v !== value);
}
