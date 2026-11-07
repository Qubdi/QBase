# Italian (it) notes

Plural keys: `_one`, `_many`, `_other` (Intl.PluralRules('it') gives one, many, other). `_many` is used for
millions and above, so it reads "{{count}} di campi".

Register: formal and impersonal. Buttons and menu items use the bare imperative (Salva, Apri); sentences that
address the reader use the infinitive or the impersonal form (Scegliere un nome, Premere Invio, Riprovare).
Color picker labels such as "I tuoi colori" are the only places that address the reader with "tu" (a short label
copied from the English "Your colors"); change to "Colori personali" if a stricter register is wanted.

## Glossary
- table: tabella; view: vista; materialized view: vista materializzata
- field / column: campo (diagnostics about SQL columns use colonna)
- relationship (ref): relazione; foreign key: chiave esterna; primary key: chiave primaria
- diagram: diagramma; canvas: canvas (kept, as in the English term); side panel: pannello laterale
- area: area; note: nota; schema: schema; custom type: tipo personalizzato
- index: indice; check constraint: vincolo check; unique: univoco; nullable: ammette null
- cardinality: cardinalità; default value: valore predefinito

## Doubts
- diagnostics.found_* / foundViews_* : "Trovata 1 tabella" is used as a sentence start ("Trovate 3 tabelle e 2 viste da importare."); with 1 table and several views the verb agrees with the first noun only.
- importing.box.found uses "Trovati: {{tables}} e {{links}}." to avoid gender agreement.
- "Focus on the canvas" became "Metti a fuoco sul canvas"; "kind" of custom type became "Genere" and the picker "kind" became "Tipo".
- "Auto increment", "Array", "Enum", "check", "Extra" kept as technical or loan words.
