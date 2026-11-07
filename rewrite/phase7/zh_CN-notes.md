# zh_CN notes

Glossary: table 表, field 字段, relationship 关系, diagram 图表, area 区域, note 备注, schema 模式, custom type 自定义类型, view 视图, index 索引, primary/foreign key 主键/外键, cardinality 基数. Register: neutral, 您 where a pronoun is needed.

Plural: only `_other` (CLDR zh); the English `_one` keys are not duplicated.

Left as in English (brand/technical/abbreviation): DBML, Supabase, Timescale, MySQL 5.7, Cloudflare D1, null, NOT NULL, UQ, 1:1, 1:N, Ctrl, ⌘, #rrggbb.

Doubts:
- `diagnostics.foundWithViews/foundOnly` and `importing.box.found` compose "Found N tables" + rest; worded so the join reads "找到 2 个表和 1 个视图，可导入。".
- `import.skipped_*` embeds `{{kind}}` (statement kind) between number and noun; word order may be odd for some kinds.
- "diagram" is 图表 (generic) rather than 关系图/ER 图; change if the product prefers ER-diagram wording.
