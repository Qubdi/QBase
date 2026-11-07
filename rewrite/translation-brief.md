# Translation brief (Phase 7, other languages)

Work in /home/qubdi/Desktop/Qubdi/QBase on branch `rewrite/clean-room`. Never read `main` or
ChartDB sources or any old translation (`git show main:...`): translate from the English in this tree only.
Do not commit, push or switch branches. Edit only your own locale files `src/i18n/locales/<code>.ts`
and write `rewrite/phase7/<code>-notes.md` (glossary + doubts). Node via
`docker run --rm -u $(id -u) -v "$PWD":/w -w /w -e HOME=/tmp -e NPM_CONFIG_UPDATE_NOTIFIER=false node:24 <cmd>`.

Scope: translate `translation.menu`, `translation.editor.*` and `translation.canvas` from `src/i18n/locales/en.ts`
(sources: src/i18n/editor/*.ts, src/i18n/canvas-strings.ts) COMPLETELY. Leave `qubdi.*` out (it falls back to English).
Method: write a small script (run in docker, keep it in the scratchpad, not the repo) that loads the English
object and prints every leaf path and value as JSON; translate the values into a JSON file; another script rebuilds
the nested object and writes `src/i18n/locales/<code>.ts` as
`export const <code> = { translation: { ... } };` (keep the export name = file name, 4-space indent, run
`npx eslint --fix` on the file so Prettier is happy; strings with quotes are fine).
Rules: keep every `{{placeholder}}` exactly and every key; keep product/brand words (QBase, PostgreSQL, SQL, DBML, JSON,
SVG, PNG, Ctrl/Cmd names) untranslated; sentence case in the target language's convention; one consistent term for
table, field, relationship, diagram, area, note, schema, custom type (put the glossary in your notes file);
short UI-length strings; formal/neutral register (de: Sie, fr: vous, es: usted-neutral/tú consistently, ja: です・ます,
ko: 합쇼/해요 consistently, ru/uk: вы, tr: siz). Plural keys: use the CLDR plural suffixes of the target language
(en has `_one`/`_other`; ja, ko, zh, tr need `_other` (tr also `_one`); ru and uk need `_one`, `_few`, `_many`, `_other`;
fr and pt_BR need `_one`, `_many`, `_other`; es needs `_one`, `_many`, `_other`; de `_one`, `_other`) — i18next picks the form from the language.
Verify: a script that loads your file and en, and checks (1) every English key exists in yours (allowing the plural suffix
differences above), (2) the same placeholders per key, (3) no value equal to English except brand/technical words;
then run `npx vitest run src/i18n` and `npx tsc -p tsconfig.app.json --noEmit` (0 errors).
Report: files, any strings you were unsure about.
