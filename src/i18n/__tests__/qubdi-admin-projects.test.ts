import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { adminProjects } from '../qubdi/admin-projects';

const PREFIX = 'qubdi.adminProjects';

/** Every dotted path to a string in the key file. */
const leaves = (node: object, path: string[] = []): string[] =>
    Object.entries(node).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [[...path, key].join('.')]
            : leaves(value as object, [...path, key])
    );

describe('admin projects text', () => {
    const paths = leaves(adminProjects);

    it('has keys', () => {
        expect(paths.length).toBeGreaterThan(100);
    });

    it.each(paths)('%s is wired to a real sentence', (path) => {
        // a plural key is looked up without its suffix, with a count
        const base = path.replace(/_(one|other)$/, '');
        const key = `${PREFIX}.${base}`;
        const options = base === path ? {} : { count: 2 };
        expect(i18n.exists(key, options)).toBe(true);
        const text = i18n.t(key, options);
        expect(text).not.toBe('');
        expect(text).not.toBe(key);
    });

    it('fills in values', () => {
        expect(i18n.t(`${PREFIX}.projects.noMatch`, { query: 'orders' })).toBe(
            'No projects match "orders".'
        );
        expect(i18n.t(`${PREFIX}.links.description`, { title: 'Orders' })).toBe(
            'Orders. The address of a link is shown once, to the person who made it, so it cannot be listed here; it can be ended.'
        );
    });

    it('chooses the singular or the plural by count', () => {
        const key = `${PREFIX}.projects.members`;
        expect(i18n.t(key, { count: 1 })).toBe('1 member');
        expect(i18n.t(key, { count: 3 })).toBe('3 members');
        const rows = `${PREFIX}.activity.exportedRows`;
        expect(i18n.t(rows, { count: 1 })).toBe('1 row saved as CSV.');
        expect(i18n.t(rows, { count: 5 })).toBe('5 rows saved as CSV.');
    });
});
