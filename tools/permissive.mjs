// Which licence expressions need no review. An expression such as
// (MIT OR Apache-2.0) is permissive only when every id in it is: a bare
// "(...)" is not enough.
const PERMISSIVE_IDS = new Set([
    'MIT',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache-2.0',
    '0BSD',
    'BlueOak-1.0.0',
    'Unlicense',
    'CC0-1.0',
    'Python-2.0',
    'MIT-0',
]);

export function isPermissive(license) {
    const ids = (license.match(/[A-Za-z0-9.+-]+/g) ?? []).filter(
        (id) => !['AND', 'OR', 'WITH'].includes(id)
    );
    return ids.length > 0 && ids.every((id) => PERMISSIVE_IDS.has(id));
}
