import { de as deQubdi } from '../qubdi-locales/de';

export const de = {
    translation: {
        editor: {
            common: {
                copyFailed: {
                    title: 'Kopieren fehlgeschlagen',
                    unsupported: 'Zwischenablage wird nicht unterstützt.',
                    generic:
                        'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
                },
                cancel: 'Abbrechen',
                close: 'Schließen',
                back: 'Zurück',
                continue: 'Weiter',
                loading: 'Wird geladen',
                app: {
                    title: 'QBase – Datenbankschema-Diagramme',
                    description:
                        'Datenbankschema-Diagramme: Importieren Sie eine laufende Datenbank, veröffentlichen Sie Versionen, teilen Sie schreibgeschützte Links, synchronisieren Sie erneut und erkennen Sie Abweichungen.',
                },
                notFound: {
                    title: 'Hier fehlt etwas.',
                    body: 'Die gesuchte Seite wurde nicht gefunden. Sie wurde möglicherweise verschoben oder der Link ist falsch.',
                },
                problem: {
                    title: 'Etwas ist schiefgelaufen.',
                    body: 'Die Seite konnte nicht angezeigt werden. Laden Sie neu und versuchen Sie es erneut; Ihre gespeicherten Diagramme sind nicht betroffen.',
                    reload: 'Neu laden',
                },
                colorPicker: {
                    change: 'Farbe ändern',
                    use: 'Verwenden',
                    useColor: '{{color}} verwenden',
                    remove: '{{color}} entfernen',
                    yourColors: 'Ihre Farben',
                    pickCustom: 'Eigene Farbe wählen',
                    hex: 'Hex-Farbe',
                    hexPlaceholder: '#rrggbb',
                    invalid: 'Geben Sie eine Hex-Farbe ein, z. B. #8eb7ff.',
                },
            },
            workspace: {
                frame: {
                    resizePanel: 'Größe der Seitenleiste ändern',
                    openPanel: 'Bearbeitungsleiste öffnen',
                },
                canvas: {
                    editTable: 'Tabelle {{name}} bearbeiten',
                    tableName: 'Tabellenname',
                    done: 'Fertig',
                    schema: 'Schema',
                    createSchema: 'Neues Schema erstellen',
                    newSchemaName: 'Name des neuen Schemas',
                    openInPanel: 'In der Seitenleiste öffnen',
                    fieldCount_one: '{{count}} Feld',
                    fieldCount_other: '{{count}} Felder',
                    loading: 'Diagramm wird geladen ...',
                    link: {
                        title: 'Neue Beziehung',
                        from: 'Von {{table}}.{{field}}',
                        target: 'Feld in {{table}}',
                        newField: 'Neues Feld',
                        newFieldName: 'Name des neuen Felds',
                        create: 'Erstellen',
                        cancel: 'Abbrechen',
                        noKey: 'Die erste Tabelle hat keinen Primärschlüssel als Ausgangspunkt.',
                        noField:
                            'Wählen Sie ein Feld oder geben Sie dem neuen Feld einen Namen.',
                        noLink: 'Diese Felder lassen sich nicht verbinden.',
                    },
                },
                navbar: {
                    home: 'QBase-Startseite',
                    language: 'Sprache ändern',
                    searchLanguage: 'Sprachen suchen',
                    showTools: 'Werkzeugleiste einblenden',
                    hideTools: 'Werkzeugleiste ausblenden',
                    sidebarTitle: 'Seitenleiste',
                    sidebarDescription: 'Zeigt die mobile Seitenleiste an.',
                },
                name: {
                    label: 'Diagrammname',
                    confirm: 'Diesen Namen behalten',
                    rename: 'Diagramm umbenennen',
                    hint: 'Zum Umbenennen doppelklicken',
                },
                menu: {
                    label: 'Editor-Menüs',
                    diagram: {
                        label: 'Diagramm',
                        import: 'Importieren aus',
                        importFile: 'Diagrammdatei (.json)',
                        importSql: 'SQL-Skript',
                        importDbml: 'DBML-Text',
                        exportSql: 'SQL exportieren für',
                        saveAs: 'Speichern als',
                        png: 'PNG-Bild',
                        jpeg: 'JPEG-Bild',
                        svg: 'SVG-Bild',
                        json: 'Diagrammdatei (.json)',
                        delete: 'Dieses Diagramm löschen',
                    },
                    edit: {
                        label: 'Bearbeiten',
                        undo: 'Rückgängig',
                        redo: 'Wiederholen',
                        clear: 'Diagramm leeren',
                    },
                    view: {
                        label: 'Ansicht',
                        sidePanel: 'Seitenleiste ausblenden',
                        sidePanelShow: 'Seitenleiste einblenden',
                        cardinality: 'Kardinalität ausblenden',
                        cardinalityShow: 'Kardinalität einblenden',
                        fieldAttributes: 'Feldattribute ausblenden',
                        fieldAttributesShow: 'Feldattribute einblenden',
                        compactTables: 'Kompakte Tabellen',
                        compactTablesStandard: 'Standardtabellen',
                        minimap: 'Minimap ausblenden',
                        minimapShow: 'Minimap einblenden',
                        views: 'Datenbanksichten',
                        wheel: 'Zoom beim Scrollen',
                        on: 'Ein',
                        off: 'Aus',
                        theme: 'Farbschema',
                        themes: {
                            system: 'System',
                            light: 'Hell',
                            dark: 'Dunkel',
                        },
                    },
                    backup: {
                        label: 'Sicherung',
                        export: 'Diagramm exportieren',
                        restore: 'Diagramm wiederherstellen',
                    },
                },
                rail: {
                    label: 'Editor-Bereiche',
                    new: 'Neu',
                    browse: 'Öffnen',
                    tables: 'Tabellen',
                    dbml: 'DBML',
                    refs: 'Beziehungen',
                    customTypes: 'Typen',
                    visuals: 'Extras',
                },
                drawer: {
                    title: 'Diagramm verwalten',
                    description: 'Verwalten Sie die Objekte Ihres Diagramms',
                    sections: 'Abschnitt',
                    viewAll: 'Alle Optionen anzeigen ...',
                    entries: {
                        tables: 'Tabellen',
                        dbml: 'DBML',
                        refs: 'Beziehungen',
                        customTypes: 'Benutzerdefinierte Typen',
                        areas: 'Bereiche',
                        notes: 'Notizen',
                    },
                },
                toasts: {
                    saved: 'Alles ist gespeichert',
                    saving: 'Ihre letzten Änderungen werden gespeichert',
                },
                shortcuts: {
                    undo: 'Rückgängig',
                    redo: 'Wiederholen',
                    openDiagram: 'Diagramm öffnen',
                    save: 'Bestätigen, dass Änderungen gespeichert sind',
                    togglePanel: 'Seitenleiste ein- oder ausblenden',
                    fitAll: 'Alle Tabellen einpassen',
                    toggleTheme: 'Zwischen hell und dunkel wechseln',
                    toggleFilter: 'Tabellenfilter ein- oder ausblenden',
                    copyTables: 'Ausgewählte Tabellen kopieren',
                    pasteTables: 'Kopierte Tabellen einfügen',
                    removeSelection: 'Auswahl löschen',
                },
            },
            designs: {
                defaultName: 'Diagramm {{number}}',
                create: {
                    titleType: 'Für welche Datenbank ist dies?',
                    descriptionType:
                        'Die Wahl bleibt beim Diagramm. Wählen Sie eine Option, um fortzufahren.',
                    titleImport: 'Mit vorhandener Arbeit beginnen',
                    descriptionImport:
                        'Fügen Sie ein Schema ein, um das Diagramm daraus zu erstellen, oder beginnen Sie mit einem leeren.',
                    fromFile: 'Gespeicherte Datei öffnen',
                    empty: 'Leeres Diagramm',
                    checkExamples: 'Beispiele ansehen',
                    titleExamples: 'Beispiele',
                    descriptionExamples:
                        'Beginnen Sie mit einem kleinen Diagramm für eine bestimmte Datenbank. Wählen Sie eines, um es als neues Diagramm zu öffnen.',
                    emptyFromImport: 'Stattdessen leeres Diagramm',
                    import: 'Aus Text erstellen',
                    failed: 'Das Diagramm konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
                },
                examples: {
                    clinic: 'Patienten, Ärzte und Fachgebiete, mit Terminen und den dabei verschriebenen Medikamenten.',
                    bookshop:
                        'Autoren, Kategorien und Bücher, mit Kunden, ihren Bestellungen und den Artikeln jeder Bestellung.',
                    library:
                        'Filialen, Mitglieder und ausleihbare Medien, mit Ausleihen und Vormerkungen.',
                    habits: 'Personen, ihre Gewohnheiten und tägliche Eintragungen, mit Erinnerungen und Schlagwörtern.',
                    hotel: 'Hotels, Zimmerarten und Zimmer, mit Gästen, Reservierungen und Zahlungen.',
                    airline:
                        'Flughäfen, Flugzeuge und Flüge, mit Passagieren, Buchungen und Tickets.',
                },
                open: {
                    title: 'Ihre Diagramme',
                    description:
                        'Alles, was in diesem Browser gespeichert ist, zuletzt geänderte zuerst.',
                    search: 'Nach Namen suchen',
                    empty: 'Hier sind noch keine Diagramme gespeichert.',
                    noMatch: 'Kein Diagramm hat diesen Namen.',
                    columns: {
                        name: 'Name',
                        created: 'Erstellt',
                        changed: 'Geändert',
                        tables: 'Tabellen',
                        actions: 'Aktionen',
                    },
                    actionsFor: 'Aktionen für {{name}}',
                    rowOpen: 'Öffnen',
                    rowRename: 'Umbenennen',
                    rowDuplicate: 'Kopie erstellen',
                    rowDelete: 'Löschen',
                    newDatabase: 'Neues Diagramm',
                    open: 'Diagramm öffnen',
                    copySuffix: '(Kopie)',
                    duplicated: '{{name}} erstellt',
                },
                rename: {
                    title: 'Diagramm umbenennen',
                    description:
                        'Wählen Sie einen neuen Namen. Lassen Sie das Feld leer, um den aktuellen zu behalten.',
                    label: 'Diagrammname',
                    save: 'Umbenennen',
                },
                delete: {
                    title: 'Dieses Diagramm löschen?',
                    description:
                        'Diese Aktion kann nicht rückgängig gemacht werden. Das Diagramm wird dauerhaft gelöscht.',
                    confirm: 'Löschen',
                    failed: 'Das Diagramm konnte nicht gelöscht werden',
                },
                clear: {
                    title: 'Diagramm leeren?',
                    description:
                        'Alle Tabellen, Beziehungen und Notizen werden entfernt und der Verlauf geht verloren. Das Diagramm selbst bleibt bestehen. Das lässt sich nicht rückgängig machen.',
                    confirm: 'Leeren',
                    failed: 'Das Diagramm konnte nicht geleert werden',
                },
            },
            diagnostics: {
                withLine: 'Zeile {{line}}: {{text}}',
                found_one: '{{count}} Tabelle gefunden',
                found_other: '{{count}} Tabellen gefunden',
                foundViews_one: '{{count}} Sicht',
                foundViews_other: '{{count}} Sichten',
                foundWithViews: '{{tables}} und {{views}} zum Importieren.',
                foundOnly: '{{tables}} zum Importieren.',
                nothingToImport: 'Nichts zu importieren',
                invalidJson:
                    'Ungültiges JSON. Bitte korrigiere es oder schreibe uns an support@qubdi.com.',
                nothingToExport: 'Nichts zu exportieren',
                emptyScript: 'Das SQL-Skript ist leer',
                noStatements: 'Keine gültigen SQL-Anweisungen gefunden',
                addCreateTable:
                    'Fügen Sie CREATE TABLE-Anweisungen zum Importieren hinzu',
                noSemicolon:
                    'SQL-Anweisungen sollten mit einem Semikolon (;) enden',
                unterminatedComment: 'Nicht abgeschlossener Blockkommentar',
                closeComment: 'Schließen Sie den Kommentar mit */',
                unterminatedText:
                    'Nicht abgeschlossener Text in Anführungszeichen',
                closeText: 'Schließen Sie den Text mit {{quote}}',
                unmatchedParen: 'Schließende Klammer ohne öffnende',
                unclosedParen: 'Nicht geschlossene Klammer',
                dialectSyntax: {
                    serialMysql:
                        'SERIAL ist in MySQL ungültig, verwenden Sie AUTO_INCREMENT',
                    identityMysql:
                        'GENERATED ... AS IDENTITY ist in MySQL ungültig, verwenden Sie AUTO_INCREMENT',
                    sqlServerIdentityMysql:
                        'IDENTITY(a,b) ist SQL-Server-Syntax, verwenden Sie AUTO_INCREMENT',
                    autoIncrementSqlServer:
                        'AUTO_INCREMENT ist MySQL-Syntax, verwenden Sie IDENTITY(1,1)',
                    serialSqlServer:
                        'SERIAL ist PostgreSQL-Syntax, verwenden Sie IDENTITY(1,1)',
                    identitySqlServer:
                        'GENERATED ... AS IDENTITY ist in SQL Server ungültig, verwenden Sie IDENTITY(1,1)',
                    ifNotExistsSqlServer:
                        'CREATE TABLE IF NOT EXISTS ist in T-SQL ungültig',
                    schemaSqlite:
                        'CREATE SCHEMA wird in SQLite nicht unterstützt',
                    removeSchemaSqlite:
                        'Entfernen Sie Anweisungen zum Erstellen von Schemas für SQLite',
                    enumSqlite:
                        'ENUM wird in SQLite nicht unterstützt, verwenden Sie eine CHECK-Einschränkung',
                    autoIncrementSqlite:
                        'AUTO_INCREMENT ist MySQL-Syntax, verwenden Sie AUTOINCREMENT',
                    serialSqlite:
                        'SERIAL ist PostgreSQL-Syntax, verwenden Sie INTEGER PRIMARY KEY AUTOINCREMENT',
                    identitySqlite:
                        'GENERATED ... AS IDENTITY ist in SQLite ungültig, verwenden Sie AUTOINCREMENT',
                    sqlServerIdentitySqlite:
                        'IDENTITY(a,b) ist SQL-Server-Syntax, verwenden Sie AUTOINCREMENT',
                    inlineReferencesMysql:
                        'MySQL unterstützt kein Inline-REFERENCES in Spaltendefinitionen (Zeile {{line}}). Verwenden Sie stattdessen FOREIGN KEY-Einschränkungen:',
                },
                postgres: {
                    brokenCast:
                        'Ungültiger Cast-Operator ": :" gefunden. PostgreSQL verwendet "::" für Typumwandlungen.',
                    fixCast: 'Ersetzen Sie ": :" durch "::"',
                    splitDecimal:
                        'Der Typ DECIMAL ist auf mehrere Zeilen verteilt. Das kann Analysefehler verursachen.',
                    fixDecimal:
                        'Schreiben Sie Genauigkeit und Dezimalstellen in eine Zeile',
                    extension:
                        'CREATE EXTENSION gefunden. Diese werden beim Import übersprungen.',
                    functions:
                        'Funktionsdefinitionen gefunden. Diese werden beim Import übersprungen.',
                    triggers:
                        'Trigger-Definitionen gefunden. Diese werden nicht importiert.',
                    large: 'Große SQL-Datei erkannt ({{count}} Anweisungen). Der Import kann einige Zeit dauern.',
                    postgis:
                        'PostGIS-Geotypen erkannt. Diese werden importiert, zeigen aber möglicherweise keine Geometriedaten an.',
                },
                import: {
                    viewNoColumns:
                        'Die Sicht {{name}} hat keine Spalten, die sich aus ihrer Definition lesen lassen.',
                    skipped_one:
                        '{{count}} {{kind}}-Anweisung übersprungen: nicht importiert.',
                    skipped_other:
                        '{{count}} {{kind}}-Anweisungen übersprungen: nicht importiert.',
                    linkTableMissing:
                        'Fremdschlüssel in {{table}} verworfen: Tabelle {{ref}} ist nicht im Skript.',
                    linkColumnsMismatch:
                        'Fremdschlüssel in {{table}} verworfen: Die Spalten passen nicht zusammen.',
                    linkNamedMissing:
                        'Fremdschlüssel {{name}} verworfen: Eine Tabelle oder Spalte fehlt.',
                    rowsDropped_one:
                        '{{count}} Fremdschlüsselzeile verworfen: Eine Tabelle oder Spalte ist nicht im Import.',
                    rowsDropped_other:
                        '{{count}} Fremdschlüsselzeilen verworfen: Eine Tabelle oder Spalte ist nicht im Import.',
                    unsupportedType: 'Nicht unterstützter Datenbanktyp',
                    invalidDbml: 'Ungültiges DBML',
                    invalidRelationship:
                        'Ungültige Beziehung: Tabellen oder Felder nicht gefunden',
                    manyToMany:
                        'Viele-zu-viele-Referenzen (<>) werden nicht unterstützt: „{{left}}“ und „{{right}}“. Fügen Sie eine Verknüpfungstabelle hinzu, die auf beide verweist.',
                    missingIndexColumn:
                        'Der Index verweist auf eine nicht vorhandene Spalte: {{name}}',
                    invalidCheck: 'Ungültige Prüfung für {{name}}: {{problem}}',
                    arrayType:
                        'Array-Typen werden für {{dialect}}-Datenbanken nicht unterstützt. Das Feld „{{field}}“ hat den Array-Typ „{{type}}“, der nicht erlaubt ist.',
                },
                export: {
                    lostFields_one:
                        'Tabelle {{name}} hat {{count}} Feld ohne Namen verloren.',
                    lostFields_other:
                        'Tabelle {{name}} hat {{count}} Felder ohne Namen verloren.',
                    leftOutDuplicate:
                        'Tabelle {{name}} wurde ausgelassen: Eine andere Tabelle hat denselben Namen.',
                    leftOutEmpty:
                        'Tabelle {{name}} wurde ausgelassen: Sie hat keine Felder.',
                    notSupportedFor:
                        'SQL-Export wird für {{label}} nicht unterstützt',
                    notSupportedForDiagrams:
                        'SQL-Export wird für {{label}}-Diagramme nicht unterstützt',
                    conversion:
                        'Die Umwandlung in {{label}} wird nicht unterstützt',
                },
                check: {
                    empty: 'Der Ausdruck ist leer',
                    subQuery:
                        'Unterabfragen sind in einer Prüfung nicht erlaubt',
                    keyword:
                        'Das Schlüsselwort {{word}} ist in einer Prüfung nicht erlaubt',
                    extraParen: 'Unausgeglichene Klammern: überzählige )',
                    openParen:
                        'Unausgeglichene Klammern: ( ist nicht geschlossen',
                    statements:
                        'Anweisungen sind in einer Prüfung nicht erlaubt',
                    comments: 'Kommentare sind in einer Prüfung nicht erlaubt',
                },
                refusal: {
                    readOnly: 'Dieses Diagramm kann nicht bearbeitet werden',
                    nothingToUndo: 'Nichts zum Rückgängigmachen',
                    nothingToRedo: 'Nichts zum Wiederholen',
                },
            },
            importing: {
                file: {
                    title: 'Gespeichertes Diagramm öffnen',
                    description:
                        'Wählen Sie eine .json-Datei, die aus QBase gespeichert wurde. Sie wird als neues Diagramm hinzugefügt.',
                    drop: 'Datei hier ablegen oder zum Auswählen klicken',
                    types: 'Unterstützte Typen: .json',
                    action: 'Importieren',
                    invalid:
                        'Diese Datei ist kein aus QBase gespeichertes Diagramm, daher wurde nichts importiert.',
                    failed: 'Die Datei konnte nicht importiert werden. Bitte versuchen Sie es erneut.',
                    tooLarge: 'Die Datei ist zu groß (höchstens 50 MB).',
                },
                box: {
                    method: {
                        metadata: 'Smart Query',
                        sql: 'SQL-Skript',
                        dbml: 'DBML',
                    },
                    field: {
                        metadata: 'Abfrageergebnis',
                        sql: 'SQL-Skript',
                        dbml: 'DBML-Text',
                    },
                    placeholder: {
                        metadata: 'Fügen Sie hier das Ergebnis der Abfrage ein',
                        sql: 'Fügen Sie hier CREATE TABLE-Anweisungen ein',
                        dbml: 'Fügen Sie hier DBML ein',
                    },
                    edition: 'Datenbank-Edition:',
                    editionStandard: 'Standard',
                    methodLabel: 'Wie möchten Sie importieren?',
                    instructions: 'Anleitung:',
                    pasteHere: {
                        metadata:
                            '2. Fügen Sie das Ergebnis des Skripts in dieses Fenster ein →',
                        sql: '3. Öffnen Sie die exportierte SQL-Datei, kopieren Sie den Inhalt und fügen Sie ihn hier ein.',
                        dbml: 'Fügen Sie Ihre DBML-Schemadefinition (Database Markup Language) hier ein →',
                    },
                    dbClient: 'DB-Client',
                    psql: 'PSQL',
                    psqlSave:
                        'Speichern Sie das Skript als Datei und führen Sie dann aus:',
                    sqlInstall: '1. Installieren Sie {{tool}}.',
                    sqlRun: '2. Führen Sie den folgenden Befehl in Ihrem Terminal aus (unter Linux bei Bedarf mit sudo):',
                    example: 'Beispiel:',
                    resize: 'Größe des Anleitungsbereichs ändern',
                    needHelp: 'Hilfe nötig? So geht’s',
                    helpBody:
                        'Kopieren Sie das Skript, führen Sie es in Ihrer Datenbank aus, fügen Sie das Ergebnis rechts ein und klicken Sie auf Importieren.',
                    output: {
                        metadata: 'Ausgabe der Smart Query',
                        sql: 'SQL-Skript',
                        dbml: 'DBML-Skript',
                    },
                    editions: {
                        supabase: 'Supabase',
                        timescale: 'Timescale',
                        mysql_5_7: 'MySQL 5.7',
                        sql_server_2016_and_below: 'SQL Server 2016 und älter',
                        cloudflare_d1: 'Cloudflare D1',
                    },
                    scriptIntro:
                        '1. Führen Sie dieses Skript in Ihrer Datenbank aus:',
                    copyScript: 'Abfrage kopieren',
                    noScript:
                        'Für diese Datenbank wird noch keine fertige Abfrage mitgeliefert.',
                    scriptCopied: 'Abfrage kopiert',
                    truncated:
                        'Der eingefügte Text ist genau 65.535 Zeichen lang, was meist bedeutet, dass Ihr Client ihn abgeschnitten hat. Exportieren Sie die Zelle in eine Datei, statt sie aus dem Raster zu kopieren.',
                    repair: 'Text reparieren',
                    repairing: 'Text wird repariert ...',
                    repaired: 'Der Text wurde repariert.',
                    moreProblems_one: '{{count}} weiteres Problem',
                    moreProblems_other: '{{count}} weitere Probleme',
                    found: '{{tables}} und {{links}} gefunden.',
                    foundTables_one: '{{count}} Tabelle',
                    foundTables_other: '{{count}} Tabellen',
                    foundLinks_one: '{{count}} Beziehung',
                    foundLinks_other: '{{count}} Beziehungen',
                    nothing: 'In diesem Text gibt es nichts zu importieren.',
                },
                picker: {
                    title: 'Auswählen, was übernommen werden soll',
                    summary:
                        '{{selected}} von {{total}} ausgewählt (höchstens {{limit}})',
                    search: 'Nach Namen suchen',
                    kind: 'Art',
                    kindAll: 'Tabellen und Sichten',
                    kindTables: 'Nur Tabellen',
                    kindViews: 'Nur Sichten',
                    schema: 'Schema',
                    schemaAll: 'Alle Schemas',
                    selectPage: 'Alles auf dieser Seite auswählen',
                    viewTag: 'Sicht',
                    previous: 'Zurück',
                    next: 'Weiter',
                    page: 'Seite {{page}} von {{pages}}',
                },
                into: {
                    title: 'Zu diesem Diagramm hinzufügen',
                    description:
                        'Neue Tabellen werden rechts neben den vorhandenen platziert. Danach wird der Verlauf gelöscht.',
                    newTables_one: '{{count}} Tabelle wird hinzugefügt.',
                    newTables_other: '{{count}} Tabellen werden hinzugefügt.',
                    newLinks_one: '{{count}} Beziehung wird hinzugefügt.',
                    newLinks_other: '{{count}} Beziehungen werden hinzugefügt.',
                    newTypes_one:
                        '{{count}} benutzerdefinierter Typ wird hinzugefügt.',
                    newTypes_other:
                        '{{count}} benutzerdefinierte Typen werden hinzugefügt.',
                    duplicates:
                        'Diese Tabellen existieren bereits und erscheinen doppelt: {{names}}',
                    apply: 'Zum Diagramm hinzufügen',
                    done_one: '{{count}} Tabelle hinzugefügt',
                    done_other: '{{count}} Tabellen hinzugefügt',
                    failed: 'Es wurde nichts importiert',
                },
            },
            exporting: {
                sql: {
                    title: 'SQL exportieren',
                    description:
                        'Das Schema Ihres Diagramms als {{database}}-Skript exportieren',
                    script: 'Erzeugtes Skript',
                    copy: 'Kopieren',
                    copied: 'Skript kopiert',
                    download: '.sql herunterladen',
                    nothing: 'Es gibt noch keine Tabellen zum Exportieren.',
                },
                json: {
                    title: 'Als Diagrammdatei speichern',
                    description:
                        'Die Datei enthält das gesamte Diagramm und lässt sich im Bildschirm „Neues Diagramm“ wieder öffnen.',
                    summary: '{{name}} (etwa {{size}} KB)',
                    download: 'Herunterladen',
                },
                image: {
                    title: 'Bild exportieren',
                    description:
                        'Das Bild zeigt das gesamte Diagramm in den Farben, die Sie gerade verwenden.',
                    scale: 'Maßstab',
                    scaleBest: '{{scale}}x (Beste Qualität)',
                    advanced: 'Erweiterte Optionen',
                    patternHelp:
                        'Dezentes Rastermuster zum Hintergrund hinzufügen.',
                    transparentHelp: 'Hintergrundfarbe aus dem Bild entfernen.',
                    pattern: 'Gepunkteten Hintergrund zeichnen',
                    transparent: 'Transparenter Hintergrund',
                    jpegNote:
                        'JPEG kann nicht transparent sein, daher wird die Seitenfarbe verwendet.',
                    action: 'Bild speichern',
                    working: 'Bild wird erstellt',
                    empty: 'Es gibt noch nichts für das Bild',
                    failed: 'Das Bild konnte nicht erstellt werden',
                    lowered:
                        'Das Bild ist sehr groß und wurde daher mit {{scale}}x erstellt, damit es in die Browsergrenze passt',
                },
            },
            settings: {
                title: 'Einstellungen',
                description:
                    'Diese Einstellungen gehören zu diesem Browser, nicht zum Diagramm.',
                theme: 'Farbschema',
                themes: {
                    system: 'Wie System',
                    light: 'Hell',
                    dark: 'Dunkel',
                },
                language: 'Sprache',
                wheel: 'Mausrad',
                wheelModes: {
                    pan: 'Verschiebt die Ansicht',
                    zoom: 'Zoomt die Ansicht',
                },
                cardinality: 'Kardinalität der Beziehungen anzeigen',
                fieldAttributes: 'Feldattribute anzeigen',
                compactTables: 'Kompakte Tabellen verwenden',
                minimap: 'Minimap anzeigen',
                outlineOverlaps: 'Überlappende Tabellen umranden',
                views: 'Datenbanksichten anzeigen',
                shortcuts: 'Tastenkürzel',
            },
            sidePanel: {
                common: {
                    filter: 'Filtern',
                    clearFilter: 'Filter zurücksetzen',
                    focus: 'Auf der Zeichenfläche anzeigen',
                    saveName: 'Namen speichern',
                    dragHandle: 'Zum Umsortieren ziehen',
                    cancel: 'Abbrechen',
                    confirm: 'Bestätigen',
                    close: 'Schließen',
                    customColor: 'Eigene Farbe',
                },
                tables: {
                    add: 'Tabelle hinzufügen',
                    addView: 'Sicht hinzufügen',
                    addMenu: 'Weitere Möglichkeiten zum Hinzufügen',
                    empty: 'Keine Tabellen',
                    emptyHint: 'Erstellen Sie eine Tabelle, um zu beginnen',
                    noMatch: 'Keine Tabellen für Ihren Filter gefunden.',
                    allHidden: 'Alle Tabellen sind ausgeblendet',
                    showAll: 'Alle anzeigen',
                    actions: 'Tabellenaktionen',
                    changeSchema: 'Schema ändern',
                    addField: 'Feld hinzufügen',
                    addIndex: 'Index hinzufügen',
                    duplicate: 'Tabelle duplizieren',
                    delete: 'Tabelle löschen',
                    renameTable: 'Tabelle umbenennen',
                    toggle: 'Details ein- oder ausblenden',
                    doubleClickToEdit: 'Zum Bearbeiten doppelklicken',
                    viewTag: 'Sicht',
                    fields: 'Felder',
                    indexes: 'Indizes',
                    checks: 'Prüfeinschränkungen',
                    description: 'Beschreibung',
                    noDescription: 'Keine Beschreibung',
                    duplicateName:
                        'Eine andere Tabelle in diesem Schema heißt bereits „{{name}}“.',
                    selectSchema: {
                        title: 'Schema auswählen',
                        text: 'Es werden mehrere Schemas angezeigt. Wählen Sie eines für die neue Tabelle.',
                        schema: 'Schema',
                    },
                    changeSchemaDialog: {
                        title: 'Schema ändern',
                        text: 'Schema der Tabelle „{{name}}“ aktualisieren.',
                        createNew: 'Neues Schema erstellen',
                        newPlaceholder: 'Name des neuen Schemas, z. B. public',
                        change: 'Ändern',
                    },
                },
                fields: {
                    add: 'Feld hinzufügen',
                    linksRemoved:
                        'Mit dem Feld entfernte Beziehungen: {{count}}. Mit „Rückgängig“ kommen sie zurück.',
                    name: 'Feldname',
                    namePlaceholder: 'Feldname',
                    typePlaceholder: 'Typ',
                    typeSearch: 'Typen suchen',
                    typeSearchPlaceholder: 'Suchen...',
                    noTypes: 'Keine Typen gefunden',
                    standardTypes: 'Standardtypen',
                    customTypes: 'Benutzerdefinierte Typen',
                    nullable: 'NULL erlauben',
                    nullableShort: 'N',
                    primaryKey: 'Primärschlüssel',
                    attributes: 'Feldattribute',
                    unique: 'Eindeutig',
                    autoIncrement: 'Auto-Inkrement',
                    array: 'Array',
                    maxLength: 'Maximale Länge',
                    lengthNone: 'Keine',
                    lengthMax: 'Max.',
                    lengthCustom: 'Eigene',
                    precision: 'Genauigkeit',
                    scale: 'Dezimalstellen',
                    default: 'Standardwert',
                    noDefault: 'Kein Standardwert',
                    description: 'Beschreibung',
                    noDescription: 'Keine Beschreibung',
                    delete: 'Feld löschen',
                    addNote: 'Notiz hinzufügen',
                    showComment: 'Feldbeschreibung anzeigen',
                    none: 'Diese Tabelle hat keine Felder',
                },
                indexes: {
                    add: 'Index hinzufügen',
                    none: 'Keine Indizes',
                    selectFields: 'Felder auswählen',
                    noFields: 'Keine Felder gefunden',
                    unique: 'Eindeutig',
                    uniqueBlocked:
                        'Kann nicht eindeutig sein: die Datenbank kann {{fields}} nicht indizieren',
                    uniqueBlockedType:
                        'Kann nicht eindeutig sein: ein {{type}}-Index kann nicht eindeutig sein. Ändern Sie zuerst den Indextyp in {{other}}.',
                    attributes: 'Indexattribute',
                    name: 'Name',
                    type: 'Indextyp',
                    description: 'Beschreibung',
                    noDescription: 'Keine Beschreibung',
                    delete: 'Index löschen',
                    primaryKey: 'Primärschlüssel',
                    problem: {
                        arrayOrJson:
                            'Erfordert Felder vom Typ array, json, jsonb, tsvector oder hstore',
                        oneField: 'Funktioniert nur mit einem Feld',
                        notUnique: 'Kann nicht eindeutig sein',
                        needsText: 'Erfordert Textfelder (char, varchar, text)',
                        needsGeometry: 'Erfordert ein Geometriefeld',
                        needsXml: 'Erfordert ein xml-Feld',
                        oneClustered:
                            'Eine Tabelle hat nur einen gruppierten Index',
                        oneColumnstore:
                            'Eine Tabelle hat nur einen Columnstore-Index',
                        needsPrimaryKey: 'Erfordert einen Primärschlüssel',
                    },
                },
                checks: {
                    add: 'Prüfung hinzufügen',
                    none: 'Keine Prüfeinschränkungen',
                    expression: 'Ausdruck',
                    expressionPlaceholder: 'z. B. price > 0',
                    attributes: 'Prüfeinschränkung',
                    delete: 'Prüfeinschränkung löschen',
                },
                refs: {
                    filter: 'Filtern',
                    add: 'Beziehung hinzufügen',
                    collapseAll: 'Alle zuklappen',
                    relationships: 'Beziehungen',
                    dependencies: 'Abhängigkeiten',
                    dependencyTable: 'Tabelle',
                    dependentView: 'Abhängige Sicht',
                    empty: 'Keine Beziehungen',
                    emptyHint: 'Erstellen Sie eine Beziehung, um zu beginnen',
                    noMatch: 'Keine Beziehungen für Ihren Filter gefunden.',
                    primaryTable: 'Primärtabelle',
                    primaryField: 'Primärfeld',
                    referencedTable: 'Referenzierte Tabelle',
                    referencedField: 'Referenziertes Feld',
                    relatedTable: 'Verknüpfte Tabelle',
                    relatedField: 'Verknüpftes Feld',
                    cardinality: 'Kardinalität',
                    oneToOne: 'Eins zu eins',
                    oneToMany: 'Eins zu viele',
                    manyToOne: 'Viele zu eins',
                    switchTables: 'Tabellen tauschen',
                    delete: 'Löschen',
                    dialog: {
                        title: 'Beziehung erstellen',
                        selectTable: 'Tabelle auswählen',
                        selectField: 'Feld auswählen',
                        noTables: 'Keine Tabellen gefunden',
                        noFields: 'Keine Felder gefunden',
                        create: 'Erstellen',
                    },
                    toast: {
                        incompatibleTitle: 'Feldtypen sind nicht kompatibel',
                        incompatibleText:
                            'Beziehungen können nur zwischen kompatiblen Feldtypen erstellt werden',
                        existsTitle: 'Bereits verbunden',
                        existsText:
                            'Zwischen diesen beiden Feldern besteht bereits eine Beziehung',
                        failedTitle:
                            'Die Beziehung konnte nicht erstellt werden',
                        failedText:
                            'Wählen Sie zwei Felder aus zwei verschiedenen Tabellen.',
                    },
                },
                userTypes: {
                    add: 'Neuer Typ',
                    empty: 'Keine benutzerdefinierten Typen',
                    emptyHint:
                        'Benutzerdefinierte Typen erscheinen hier, sobald Ihre Datenbank sie bereitstellt',
                    noMatch:
                        'Keine benutzerdefinierten Typen für Ihren Filter gefunden.',
                    actions: 'Aktionen',
                    highlight: 'Felder hervorheben',
                    clearHighlight: 'Hervorhebung aufheben',
                    delete: 'Löschen',
                    rename: 'Typ umbenennen',
                    kind: 'Art',
                    enumValues: 'Enum-Werte',
                    enum: 'Enum',
                    composite: 'Zusammengesetzt',
                    valuePlaceholder: 'Enum-Wert hinzufügen ...',
                    addValue: 'Wert hinzufügen',
                    removeValue: '{{value}} entfernen',
                    noValues: 'Keine Enum-Werte definiert',
                    memberName: 'Feldname',
                    memberType: 'Typ auswählen',
                    addMember: 'Feld hinzufügen',
                    removeMember: 'Feld entfernen',
                    noMembers: 'Keine Felder definiert',
                },
                visuals: {
                    areas: 'Bereiche',
                    notes: 'Notizen',
                    areaFilter: 'Filtern',
                    addArea: 'Bereich hinzufügen',
                    noAreas: 'Keine Bereiche',
                    noAreasHint: 'Erstellen Sie einen Bereich, um zu beginnen',
                    noAreasMatch: 'Keine Bereiche für Ihren Filter gefunden.',
                    areaActions: 'Bereichsaktionen',
                    editName: 'Namen bearbeiten',
                    deleteArea: 'Bereich löschen',
                    toggleTables:
                        'Tabellen des Bereichs ein- oder ausblenden: {{name}}',
                    tableCount: 'Tabellen: {{count}}',
                    noTablesInArea: 'Keine Tabellen in diesem Bereich',
                    outsideAreas: 'Tabellen außerhalb aller Bereiche',
                    addNote: 'Notiz hinzufügen',
                    attachedTo: 'Gehört zu {{name}}',
                    selectOwner:
                        'Wählen Sie zuerst eine Tabelle oder einen Bereich',
                    noNotes: 'Keine Notizen',
                    noNotesHint:
                        'Wählen Sie eine Tabelle oder einen Bereich und fügen Sie eine Notiz hinzu, die daran hängt',
                    noNotesMatch: 'Keine Notizen gefunden',
                    emptyNote: 'Leere Notiz',
                    noteActions: 'Notizaktionen',
                    deleteNote: 'Notiz löschen',
                },
                filters: {
                    title: 'Suchen & Filtern',
                    search: 'Tabellen oder Felder suchen ...',
                    searchOnlyTables: 'Tabellen suchen ...',
                    searchOnlyFields: 'Felder suchen ...',
                    searchInTables: 'In Tabellennamen suchen',
                    searchInFields: 'In Feldnamen suchen',
                    showMoreFields: 'Noch {{count}} anzeigen',
                    showFewerFields: 'Weniger anzeigen',
                    focusField: 'Fokussieren: {{table}}.{{field}}',
                    groupBySchema: 'Nach Schema gruppieren',
                    groupByArea: 'Nach Bereich gruppieren',
                    show: 'Anzeigen',
                    hide: 'Ausblenden',
                    zoomTo: 'Auf {{name}} zoomen',
                    noTables: 'Keine Tabellen gefunden',
                    tryAdjusting: 'Passen Sie Ihre Suche oder Ihren Filter an',
                    createToStart: 'Erstellen Sie eine Tabelle, um zu beginnen',
                    noSchema: 'Kein Schema',
                    noArea: 'Kein Bereich',
                },
                dbml: {
                    title: 'DBML',
                    empty: 'Noch nichts anzuzeigen',
                    copy: 'Kopieren',
                    standardRefs: 'Standard-Refs anzeigen',
                    inlineRefs: 'Inline-Refs anzeigen',
                    copied: 'Kopiert',
                    edit: 'Bearbeiten',
                    view: 'Ansehen',
                    accept: 'Änderungen übernehmen',
                    undo: 'Änderungen verwerfen',
                    editor: 'DBML-Text',
                    parseError:
                        'DBML konnte nicht analysiert werden. Bitte prüfen Sie die Syntax. (1 Fehler gefunden – in Zeile {{line}})',
                    parseErrorNoLine:
                        'DBML konnte nicht analysiert werden. Bitte prüfen Sie die Syntax. (1 Fehler gefunden)',
                    summary:
                        '{{added}} neue, {{removed}} entfernte, {{changed}} geänderte Tabellen; {{linksAdded}} neue, {{linksRemoved}} entfernte Beziehungen',
                    rejected: 'Die Änderung konnte nicht angewendet werden',
                    applying: 'Änderungen werden angewendet ...',
                    leftOut: 'Vom Export ausgelassen',
                    errorText: '// Fehler beim Erzeugen von DBML: {{message}}',
                    errorToast: 'DBML-Exportfehler',
                },
            },
        },
        canvas: {
            a11y: {
                moved: '{{name}} verschoben',
                selected: '{{name}} ausgewählt',
                nodeHint:
                    'Eingabetaste zum Bearbeiten. Pfeiltasten verschieben, mit Umschalt weiter. Umschalt+F10 öffnet das Menü.',
                edgeHint:
                    'Eingabetaste wählt die Beziehung aus, Entf löscht sie, Esc bricht ab.',
            },
            surface: {
                label: 'Diagrammfläche',
                loading: 'Diagramm wird geladen ...',
            },
            snap: {
                label: 'Am Raster ausrichten ({{key}} gedrückt halten)',
            },
            overlap: {
                label: 'Überlappende Tabellen hervorheben',
            },
            highlight: {
                label: '„{{name}}“ ist hervorgehoben – zum Aufheben klicken',
            },
            legend: {
                label: 'Typfarben',
                text: 'Text / andere',
                number: 'Zahl',
                moment: 'Datum und Zeit',
                identifier: 'Kennung',
                flag: 'Boolesch',
                document: 'JSON / XML',
            },
            toolbar: {
                label: 'Zeichenflächen-Werkzeuge',
                filter: 'Suchen & Filtern ({{shortcut}})',
                showAll: 'Alle anzeigen ({{shortcut}})',
                zoomOut: 'Verkleinern',
                zoomIn: 'Vergrößern',
                zoomReset: 'Zoom auf 100 % zurücksetzen',
                arrange: 'Diagramm automatisch anordnen',
                undo: 'Rückgängig ({{shortcut}})',
                redo: 'Wiederholen ({{shortcut}})',
            },
            showAllPill: 'Alle anzeigen',
            hiddenAll: {
                title: 'Alle Tabellen sind ausgeblendet',
                action: 'Alle anzeigen',
            },
            diff: {
                added: 'Neue Tabelle',
                removed: 'Tabelle entfernt',
                changed: 'Tabelle geändert',
            },
            entity: {
                view: 'Sicht',
                materializedView: 'materialisierte Sicht',
                fieldCount_other: '{{count}} Felder',
                fieldCount_one: '{{count}} Feld',
                focus: 'Auf der Zeichenfläche anzeigen',
                showMore: 'Mehr anzeigen',
                showLess: 'Weniger anzeigen',
                edit: 'Tabelle bearbeiten',
                unique: 'UQ',
                nullable: 'Darf leer sein',
                required: 'Erforderlich',
                primaryKey: 'Primärschlüssel',
                foreignKey: 'Fremdschlüssel',
            },
            fieldCard: {
                type: 'Typ',
                key: 'Schlüssel',
                nullable: 'NULL erlaubt',
                notNull: 'Nicht NULL',
                unique: 'Eindeutig',
                primaryKey: 'Primärschlüssel',
                default: 'Standard',
                references: 'verweist auf {{table}}.{{field}}',
                referencedBy: 'referenziert von {{table}}.{{field}}',
            },
            link: {
                label: 'Beziehung {{name}}',
                select: 'Ausgewählte Beziehung',
                popover: {
                    oneToOne: '1:1',
                    oneToMany: '1:N',
                    switch: 'Tabellen tauschen',
                    openInPanel: 'In der Seitenleiste öffnen',
                    remove: 'Beziehung löschen',
                },
                incompatible: {
                    title: 'Feldtypen sind nicht kompatibel',
                    text: 'Beziehungen können nur zwischen kompatiblen Feldtypen erstellt werden',
                },
                exists: {
                    title: 'Bereits verbunden',
                    text: 'Zwischen diesen beiden Feldern besteht bereits eine Beziehung',
                },
            },
            region: {
                rename: 'Bereichsname',
            },
            memo: {
                placeholder: 'Leere Notiz',
                edit: 'Notiztext',
                editNote: 'Notiz bearbeiten',
            },
            menu: {
                newTable: 'Neue Tabelle',
                newView: 'Neue Sicht',
                newRelationship: 'Neue Beziehung',
                newArea: 'Neuer Bereich',
                addNote: 'Notiz hinzufügen',
                addFieldNote: 'Notiz zum Feld hinzufügen',
                arrange: 'Diagramm automatisch anordnen',
                moveToArea: 'In Bereich verschieben',
                moveToAreaCount: 'In Bereich verschieben ({{count}})',
                noArea: 'Kein Bereich',
                editTable: 'Tabelle bearbeiten',
                duplicateTable: 'Tabelle duplizieren',
                addRelationship: 'Beziehung hinzufügen',
                deleteTable: 'Tabelle löschen',
                deleteTables: 'Tabellen löschen ({{count}})',
                editAreaName: 'Bereichsnamen bearbeiten',
                arrangeArea: 'Automatisch anordnen',
                deleteArea: 'Bereich löschen',
            },
            arrange: {
                title: 'Diagramm automatisch anordnen',
                text: 'Diese Aktion ordnet alle Tabellen im Diagramm neu an. Möchten Sie fortfahren?',
                confirm: 'Automatisch anordnen',
                cancel: 'Abbrechen',
            },
            clipboard: {
                copiedOne: 'Tabelle kopiert',
                copiedMany: '{{count}} Tabellen kopiert',
                hint: 'Drücken Sie {{key}}, um sie einzufügen.',
                pastedOne: 'Tabelle eingefügt',
                pastedMany: '{{count}} Tabellen eingefügt',
            },
            drawing: {
                hint: 'Klicken Sie auf die Tabelle, die den Fremdschlüssel enthält',
            },
        },
        qubdi: deQubdi,
    },
};
