# ka (Georgian) notes

File: src/i18n/locales/ka.ts. Plural categories for `ka` (Intl.PluralRules): `one`, `other`. Georgian keeps the noun singular after a number, so both forms read the same ("{{count}} ცხრილი").
Register: formal (თქვენ, polite imperative: "აირჩიეთ"). Quotes: „…“.

## Glossary
- table: ცხრილი
- field: ველი (a database "column" in SQL diagnostics: სვეტი)
- relationship: კავშირი (rail/drawer "refs": კავშირები)
- diagram: დიაგრამა
- schema: სქემა
- custom type: მორგებული ტიპი
- area: არეალი
- note: შენიშვნა
- view: ხედი; index: ინდექსი; check constraint: შემოწმების შეზღუდვა
- primary key: პირველადი გასაღები; foreign key: გარე გასაღები
- canvas: კანვასი

## Doubts
- `canvas.fieldCard.nullable`, `notNull`, `editor.sidePanel.hover.nullability/notNull`, `fieldCard` labels: kept as technical SQL words (Nullable, Not null, NOT NULL, null), same as English.
- `rail.customTypes` "Types" -> ტიპები, `rail.visuals` "Extras" -> დამატებითი (short for the rail).
- "Auto arrange" -> ავტომატური განლაგება; "Match system" -> სისტემის მიხედვით.
- `refs.switchTables` / `popover.switch` ("Switch tables") rendered as "ცხრილების გადაადგილება ადგილებზე"; maybe too long for a button, a native speaker may prefer "ცხრილების გაცვლა".
- `importing.box.truncated` uses "65 535" (Georgian digit grouping with a space).
- `editions.*` and brand names left as is.
