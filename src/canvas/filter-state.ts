import { traitsOf } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { entityList } from '@/core/model/lookup';
import { isVisible } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';

/** True when the filter hides at least one table (the Filter button turns teal, EDT-042). */
export function filterHidesSomething(
    design: Design,
    filter: VisibilityFilter
): boolean {
    const defaultSchema = traitsOf(design.databaseType).defaultSchema;
    return entityList(design).some(
        (entity) => !isVisible(filter, entity, defaultSchema)
    );
}
