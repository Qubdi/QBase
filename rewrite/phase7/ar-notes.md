# ar notes

Glossary: table جدول, field حقل, relationship علاقة, diagram مخطط, area منطقة, note ملاحظة, schema سكيما, custom type نوع مخصص, view عرض, index فهرس, primary/foreign key مفتاح أساسي/خارجي, cardinality الكاردينالية. Register: neutral imperative (masculine/neutral forms).

Plural: all six CLDR forms (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`) for every English `_one/_other` pair (14 messages). `_many` uses the accusative singular (11-99), `_other` the plain singular (fractions).

Left as in English: DBML, Supabase, Timescale, MySQL 5.7, Cloudflare D1, null, NOT NULL, UQ, N, Enum, 1:1, 1:N, Ctrl, ⌘, #rrggbb.

Doubts:
- "diagram" and "schema" both map naturally to "مخطط"; diagram is مخطط and schema is the loanword سكيما to keep them apart.
- Non-plural messages with a count (`clipboard.*Many`, `deleteTables`) use the form "الجداول ({{count}})" to avoid number agreement.
- `import.skipped_*` embeds `{{kind}}` after "عبارة"; no declension possible.
- "materialized view" is "عرض ممَثَّل (materialized)"; no settled Arabic term.
