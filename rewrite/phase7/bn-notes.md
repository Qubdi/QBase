# bn notes

Glossary: table টেবিল, field ফিল্ড, relationship সম্পর্ক, diagram ডায়াগ্রাম, area এলাকা, note নোট, schema স্কিমা, custom type কাস্টম টাইপ, view ভিউ, index ইনডেক্স, primary/foreign key প্রাইমারি/ফরেন কী, cardinality কার্ডিনালিটি. Register: আপনি.

Plural: `_one` and `_other`. Bengali has no noun inflection for number, so both forms are identical ("{{count}}টি ...").

Left as in English: DBML, Supabase, Timescale, MySQL 5.7, Cloudflare D1, null, NOT NULL, UQ, N, Enum, 1:1, 1:N, Ctrl, ⌘, #rrggbb.

Doubts:
- Digits in static text (e.g. "১টি ত্রুটি", "৬৫,৫৩৫", "১০০%") use Bengali numerals while `{{count}}` stays as the app formats it (Latin digits).
- Case suffixes after placeholders ("{{table}}-এর", "{{name}}-এ") are hyphenated; fine for Latin names.
- `import.skipped_*` embeds `{{kind}}` before "স্টেটমেন্ট"; no inflection possible.
