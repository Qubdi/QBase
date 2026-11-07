import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/platform/ui/checkbox';
import { Input } from '@/platform/ui/input';
import { PICKER_LIMIT } from './picker-rows';
import type { PickerRow } from './picker-rows';

const PAGE = 50;

export interface TablePickerProps {
    rows: readonly PickerRow[];
    selected: ReadonlySet<string>;
    onChange: (next: Set<string>) => void;
}

type Kind = 'all' | 'tables' | 'views';

/** Search, kind and schema filters, and paged tick boxes over the found tables. */
export const TablePicker: React.FC<TablePickerProps> = ({
    rows,
    selected,
    onChange,
}) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<Kind>('all');
    const [schema, setSchema] = useState('');
    const [page, setPage] = useState(0);

    const schemas = useMemo(
        () => [...new Set(rows.map((r) => r.schema))].sort(),
        [rows]
    );
    const shown = useMemo(
        () =>
            rows.filter(
                (r) =>
                    (kind === 'all' || (kind === 'views') === r.view) &&
                    (schema === '' || r.schema === schema) &&
                    r.name.toLowerCase().includes(search.trim().toLowerCase())
            ),
        [rows, kind, schema, search]
    );
    const pages = Math.max(1, Math.ceil(shown.length / PAGE));
    const current = Math.min(page, pages - 1);
    const visible = shown.slice(current * PAGE, current * PAGE + PAGE);
    const allOnPage =
        visible.length > 0 && visible.every((r) => selected.has(r.key));

    const toggle = (key: string, on: boolean) => {
        const next = new Set(selected);
        if (on) {
            if (next.size >= PICKER_LIMIT) return;
            next.add(key);
        } else next.delete(key);
        onChange(next);
    };
    const togglePage = (on: boolean) => {
        const next = new Set(selected);
        for (const r of visible) {
            if (!on) next.delete(r.key);
            else if (next.size < PICKER_LIMIT) next.add(r.key);
        }
        onChange(next);
    };

    return (
        <section
            aria-label={t('editor.importing.picker.title')}
            className="flex flex-col gap-2 rounded-md border p-3"
        >
            <p className="text-sm font-medium">
                {t('editor.importing.picker.title')}
            </p>
            <p className="text-xs text-muted-foreground">
                {t('editor.importing.picker.summary', {
                    selected: selected.size,
                    total: rows.length,
                    limit: PICKER_LIMIT,
                })}
            </p>
            <div className="flex flex-wrap gap-2">
                <Input
                    className="h-8 w-48"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                    }}
                    placeholder={t('editor.importing.picker.search')}
                    aria-label={t('editor.importing.picker.search')}
                />
                <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={kind}
                    aria-label={t('editor.importing.picker.kind')}
                    onChange={(e) => {
                        setKind(e.target.value as Kind);
                        setPage(0);
                    }}
                >
                    <option value="all">
                        {t('editor.importing.picker.kindAll')}
                    </option>
                    <option value="tables">
                        {t('editor.importing.picker.kindTables')}
                    </option>
                    <option value="views">
                        {t('editor.importing.picker.kindViews')}
                    </option>
                </select>
                <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={schema}
                    aria-label={t('editor.importing.picker.schema')}
                    onChange={(e) => {
                        setSchema(e.target.value);
                        setPage(0);
                    }}
                >
                    <option value="">
                        {t('editor.importing.picker.schemaAll')}
                    </option>
                    {schemas.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
                <Checkbox
                    checked={allOnPage}
                    onCheckedChange={(v) => togglePage(v === true)}
                />
                {t('editor.importing.picker.selectPage')}
            </label>
            <ul className="max-h-48 overflow-auto text-sm">
                {visible.map((r) => (
                    <li key={r.key}>
                        <label className="flex items-center gap-2 py-0.5">
                            <Checkbox
                                checked={selected.has(r.key)}
                                onCheckedChange={(v) =>
                                    toggle(r.key, v === true)
                                }
                            />
                            <span className="truncate">
                                {r.schema ? `${r.schema}.${r.name}` : r.name}
                            </span>
                            {r.view ? (
                                <span className="text-xs text-muted-foreground">
                                    {t('editor.importing.picker.viewTag')}
                                </span>
                            ) : null}
                        </label>
                    </li>
                ))}
            </ul>
            {pages > 1 ? (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <button
                        type="button"
                        className="underline disabled:no-underline disabled:opacity-40"
                        disabled={current === 0}
                        onClick={() => setPage(current - 1)}
                    >
                        {t('editor.importing.picker.previous')}
                    </button>
                    <span>
                        {t('editor.importing.picker.page', {
                            page: current + 1,
                            pages,
                        })}
                    </span>
                    <button
                        type="button"
                        className="underline disabled:no-underline disabled:opacity-40"
                        disabled={current >= pages - 1}
                        onClick={() => setPage(current + 1)}
                    >
                        {t('editor.importing.picker.next')}
                    </button>
                </div>
            ) : null}
        </section>
    );
};
