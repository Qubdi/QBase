export const es = {
    translation: {
        menu: {
            actions: {
                save: 'Guardar',
            },
        },
        editor: {
            common: {
                cancel: 'Cancelar',
                close: 'Cerrar',
                back: 'Volver',
                continue: 'Continuar',
                loading: 'Cargando',
                app: {
                    title: 'QBase - Diagramas de esquemas de bases de datos',
                    description:
                        'Diagramas de esquemas de bases de datos: importa una base de datos en vivo, publica versiones, comparte enlaces de solo lectura, vuelve a sincronizar y detecta desviaciones.',
                },
                notFound: {
                    title: 'Falta algo.',
                    body: 'No pudimos encontrar la página que buscas. Puede que se haya movido o que el enlace sea incorrecto.',
                },
                colorPicker: {
                    change: 'Cambiar color',
                    use: 'Usar',
                    useColor: 'Usar {{color}}',
                    remove: 'Quitar {{color}}',
                    yourColors: 'Tus colores',
                    pickCustom: 'Elegir un color personalizado',
                    hex: 'Color hexadecimal',
                    hexPlaceholder: '#rrggbb',
                    invalid: 'Introduce un color hexadecimal como #8eb7ff.',
                },
            },
            workspace: {
                frame: {
                    canvasPlaceholder:
                        'La superficie del diagrama aparece aquí',
                    panelPlaceholder: 'El panel lateral aparece aquí',
                    resizePanel: 'Cambiar el tamaño del panel lateral',
                    openPanel: 'Abrir el panel de edición',
                },
                canvas: {
                    editTable: 'Editar la tabla {{name}}',
                    tableName: 'Nombre de la tabla',
                    done: 'Listo',
                    schema: 'Esquema',
                    createSchema: 'Crear un esquema nuevo',
                    newSchemaName: 'Nombre del esquema nuevo',
                    openInPanel: 'Abrir en el panel lateral',
                    fieldCount_one: '{{count}} campo',
                    fieldCount_other: '{{count}} campos',
                    fieldCount_many: '{{count}} de campos',
                    loading: 'Cargando el diagrama...',
                    link: {
                        title: 'Nueva relación',
                        from: 'Desde {{table}}.{{field}}',
                        target: 'Campo en {{table}}',
                        newField: 'Campo nuevo',
                        newFieldName: 'Nombre del campo nuevo',
                        create: 'Crear',
                        cancel: 'Cancelar',
                        noKey: 'La primera tabla no tiene una clave primaria desde la que empezar.',
                        noField:
                            'Elige un campo o ponle nombre al campo nuevo.',
                        noLink: 'Estos campos no se pueden conectar.',
                    },
                },
                navbar: {
                    home: 'Inicio de QBase',
                    language: 'Cambiar idioma',
                    searchLanguage: 'Buscar idiomas',
                    showTools: 'Mostrar la barra de herramientas',
                    hideTools: 'Ocultar la barra de herramientas',
                },
                name: {
                    label: 'Nombre del diagrama',
                    confirm: 'Conservar este nombre',
                    rename: 'Cambiar el nombre del diagrama',
                    hint: 'Haz doble clic para cambiar el nombre',
                },
                banner: {
                    openOnly:
                        'Los diagramas de {{database}} se pueden abrir y ver, pero no modificar, en esta versión del editor.',
                },
                menu: {
                    label: 'Menús del editor',
                    diagram: {
                        label: 'Diagrama',
                        import: 'Importar desde',
                        importFile: 'Archivo de diagrama (.json)',
                        importSql: 'Script SQL',
                        importDbml: 'Texto DBML',
                        exportSql: 'Exportar SQL para',
                        saveAs: 'Guardar como',
                        png: 'Imagen PNG',
                        jpeg: 'Imagen JPEG',
                        svg: 'Imagen SVG',
                        json: 'Archivo de diagrama (.json)',
                        delete: 'Eliminar este diagrama',
                    },
                    edit: {
                        label: 'Editar',
                        undo: 'Deshacer',
                        redo: 'Rehacer',
                        clear: 'Vaciar el diagrama',
                    },
                    view: {
                        label: 'Ver',
                        sidePanel: 'Panel lateral',
                        cardinality: 'Cardinalidad de las relaciones',
                        fieldAttributes: 'Atributos de los campos',
                        compactTables: 'Tablas compactas',
                        minimap: 'Minimapa',
                        views: 'Vistas de la base de datos',
                        wheel: 'Rueda del ratón',
                        wheelPan: 'Mueve la vista',
                        wheelZoom: 'Acerca y aleja la vista',
                        theme: 'Tema de color',
                        themes: {
                            system: 'Igual que el sistema',
                            light: 'Claro',
                            dark: 'Oscuro',
                        },
                        themeKey: 'Alternar claro y oscuro',
                        preferences: 'Preferencias',
                    },
                },
                rail: {
                    label: 'Secciones del editor',
                    new: 'Nuevo',
                    browse: 'Abrir',
                    tables: 'Tablas',
                    dbml: 'DBML',
                    refs: 'Relaciones',
                    customTypes: 'Tipos',
                    visuals: 'Extras',
                },
                drawer: {
                    title: 'Contenido del diagrama',
                    description:
                        'Explora y modifica las partes de este diagrama',
                    sections: 'Sección',
                    entries: {
                        tables: 'Tablas',
                        dbml: 'DBML',
                        refs: 'Relaciones',
                        customTypes: 'Tipos personalizados',
                        areas: 'Áreas',
                        notes: 'Notas',
                    },
                },
                toasts: {
                    saved: 'Todo está guardado',
                    saving: 'Guardando tus últimos cambios',
                },
                shortcuts: {
                    undo: 'Deshacer',
                    redo: 'Rehacer',
                    openDiagram: 'Abrir un diagrama',
                    save: 'Confirmar que los cambios están guardados',
                    togglePanel: 'Mostrar u ocultar el panel lateral',
                    fitAll: 'Ajustar todas las tablas a la vista',
                    toggleTheme: 'Alternar claro y oscuro',
                    toggleFilter: 'Mostrar u ocultar el filtro de tablas',
                    copyTables: 'Copiar las tablas seleccionadas',
                    pasteTables: 'Pegar las tablas copiadas',
                    removeSelection: 'Eliminar la selección',
                },
            },
            designs: {
                defaultName: 'Diagrama {{number}}',
                create: {
                    titleType: '¿Para qué base de datos es?',
                    descriptionType:
                        'La elección se queda con el diagrama. Elige una para continuar.',
                    titleImport: 'Empieza desde un trabajo existente',
                    descriptionImport:
                        'Pega un esquema para crear el diagrama a partir de él, o empieza con uno en blanco.',
                    fromFile: 'Abrir un archivo guardado',
                    empty: 'Diagrama en blanco',
                    emptyFromImport: 'Mejor un diagrama en blanco',
                    import: 'Crear desde texto',
                    failed: 'No se pudo crear el diagrama. Inténtalo de nuevo.',
                },
                open: {
                    title: 'Tus diagramas',
                    description:
                        'Todo lo guardado en este navegador, empezando por lo modificado más recientemente.',
                    search: 'Buscar por nombre',
                    empty: 'Aún no hay diagramas guardados aquí.',
                    noMatch: 'Ningún diagrama tiene ese nombre.',
                    columns: {
                        name: 'Nombre',
                        created: 'Creado',
                        changed: 'Modificado',
                        tables: 'Tablas',
                        actions: 'Acciones',
                    },
                    actionsFor: 'Acciones para {{name}}',
                    rowOpen: 'Abrir',
                    rowRename: 'Cambiar nombre',
                    rowDuplicate: 'Hacer una copia',
                    rowDelete: 'Eliminar',
                    newDatabase: 'Diagrama nuevo',
                    open: 'Abrir diagrama',
                    copySuffix: '(Copia)',
                    duplicated: 'Se creó {{name}}',
                },
                rename: {
                    title: 'Cambiar el nombre del diagrama',
                    description:
                        'Elige un nombre nuevo. Déjalo en blanco para conservar el actual.',
                    label: 'Nombre del diagrama',
                    save: 'Cambiar nombre',
                },
                delete: {
                    title: '¿Eliminar este diagrama?',
                    description:
                        '"{{name}}" se eliminará definitivamente. No se puede deshacer.',
                    confirm: 'Eliminar',
                    failed: 'No se pudo eliminar el diagrama',
                },
                clear: {
                    title: '¿Vaciar el diagrama?',
                    description:
                        'Se eliminarán todas las tablas, relaciones y notas, y se perderá el historial. El diagrama en sí se conserva. No se puede deshacer.',
                    confirm: 'Vaciarlo',
                    failed: 'No se pudo vaciar el diagrama',
                },
            },
            diagnostics: {
                withLine: 'Línea {{line}}: {{text}}',
                found_one: 'Se encontró {{count}} tabla',
                found_other: 'Se encontraron {{count}} tablas',
                found_many: 'Se encontraron {{count}} de tablas',
                foundViews_one: '{{count}} vista',
                foundViews_other: '{{count}} vistas',
                foundViews_many: '{{count}} de vistas',
                foundWithViews: '{{tables}} y {{views}} para importar.',
                foundOnly: '{{tables}} para importar.',
                nothingToImport: 'No hay nada que importar',
                nothingToExport: 'No hay nada que exportar',
                emptyScript: 'El script SQL está vacío',
                noStatements: 'No se encontraron sentencias SQL válidas',
                addCreateTable: 'Agrega sentencias CREATE TABLE para importar',
                noSemicolon:
                    'Las sentencias SQL deben terminar con punto y coma (;)',
                unterminatedComment: 'Comentario de bloque sin cerrar',
                closeComment: 'Cierra el comentario con */',
                unterminatedText: 'Texto entre comillas sin cerrar',
                closeText: 'Cierra el texto con {{quote}}',
                unmatchedParen: 'Paréntesis de cierre sin pareja',
                unclosedParen: 'Paréntesis sin cerrar',
                dialectSyntax: {
                    serialMysql:
                        'SERIAL no es válido en MySQL, usa AUTO_INCREMENT',
                    identityMysql:
                        'GENERATED ... AS IDENTITY no es válido en MySQL, usa AUTO_INCREMENT',
                    sqlServerIdentityMysql:
                        'IDENTITY(a,b) es sintaxis de SQL Server, usa AUTO_INCREMENT',
                    autoIncrementSqlServer:
                        'AUTO_INCREMENT es sintaxis de MySQL, usa IDENTITY(1,1)',
                    serialSqlServer:
                        'SERIAL es sintaxis de PostgreSQL, usa IDENTITY(1,1)',
                    identitySqlServer:
                        'GENERATED ... AS IDENTITY no es válido en SQL Server, usa IDENTITY(1,1)',
                    ifNotExistsSqlServer:
                        'CREATE TABLE IF NOT EXISTS no es válido en T-SQL',
                    schemaSqlite: 'CREATE SCHEMA no es compatible con SQLite',
                    removeSchemaSqlite:
                        'Elimina las sentencias de creación de esquemas para SQLite',
                    enumSqlite:
                        'ENUM no es compatible con SQLite, usa una restricción CHECK',
                    autoIncrementSqlite:
                        'AUTO_INCREMENT es sintaxis de MySQL, usa AUTOINCREMENT',
                    serialSqlite:
                        'SERIAL es sintaxis de PostgreSQL, usa INTEGER PRIMARY KEY AUTOINCREMENT',
                    identitySqlite:
                        'GENERATED ... AS IDENTITY no es válido en SQLite, usa AUTOINCREMENT',
                    sqlServerIdentitySqlite:
                        'IDENTITY(a,b) es sintaxis de SQL Server, usa AUTOINCREMENT',
                    inlineReferencesMysql:
                        'MySQL no admite REFERENCES en línea en las definiciones de columna (línea {{line}}). Usa restricciones FOREIGN KEY en su lugar:',
                },
                postgres: {
                    brokenCast:
                        'Se encontró un operador de conversión no válido ": :". PostgreSQL usa "::" para convertir tipos.',
                    fixCast: 'Reemplaza ": :" por "::"',
                    splitDecimal:
                        'El tipo DECIMAL está dividido en varias líneas. Esto puede causar errores de análisis.',
                    fixDecimal:
                        'Pon la precisión y la escala en una sola línea',
                    extension:
                        'Se encontró CREATE EXTENSION. Se omitirán durante la importación.',
                    functions:
                        'Se encontraron definiciones de funciones. Se omitirán durante la importación.',
                    triggers:
                        'Se encontraron definiciones de triggers. No se importarán.',
                    large: 'Se detectó un archivo SQL grande ({{count}} sentencias). La importación puede tardar un poco.',
                    postgis:
                        'Se detectaron tipos geográficos de PostGIS. Se importarán, pero puede que no muestren datos geométricos.',
                },
                import: {
                    viewNoColumns:
                        'La vista {{name}} no tiene columnas que se puedan leer a partir de su definición.',
                    skipped_one:
                        'Se omitió {{count}} sentencia {{kind}}: no se importó.',
                    skipped_other:
                        'Se omitieron {{count}} sentencias {{kind}}: no se importaron.',
                    skipped_many:
                        'Se omitieron {{count}} de sentencias {{kind}}: no se importaron.',
                    linkTableMissing:
                        'Se descartó la clave externa de {{table}}: la tabla {{ref}} no está en el script.',
                    linkColumnsMismatch:
                        'Se descartó la clave externa de {{table}}: sus columnas no coinciden.',
                    linkNamedMissing:
                        'Se descartó la clave externa {{name}}: falta una tabla o una columna.',
                    rowsDropped_one:
                        'Se descartó {{count}} fila de clave externa: una tabla o columna no está en la importación.',
                    rowsDropped_other:
                        'Se descartaron {{count}} filas de clave externa: una tabla o columna no está en la importación.',
                    rowsDropped_many:
                        'Se descartaron {{count}} de filas de clave externa: una tabla o columna no está en la importación.',
                    unsupportedType: 'Tipo de base de datos no admitido',
                    invalidDbml: 'DBML no válido',
                    invalidRelationship:
                        'Relación no válida: no se encontraron tablas o campos',
                    manyToMany:
                        'Las referencias de muchos a muchos (<>) no se admiten: "{{left}}" y "{{right}}". Agrega una tabla intermedia que referencie a ambas.',
                    missingIndexColumn:
                        'El índice hace referencia a una columna que no existe: {{name}}',
                    invalidCheck:
                        'Restricción check no válida en {{name}}: {{problem}}',
                    arrayType:
                        'Los tipos de matriz no se admiten en bases de datos {{dialect}}. El campo "{{field}}" tiene el tipo de matriz "{{type}}", que no está permitido.',
                },
                export: {
                    lostFields_one:
                        'La tabla {{name}} perdió {{count}} campo sin nombre.',
                    lostFields_other:
                        'La tabla {{name}} perdió {{count}} campos sin nombre.',
                    lostFields_many:
                        'La tabla {{name}} perdió {{count}} de campos sin nombre.',
                    leftOutDuplicate:
                        'La tabla {{name}} se dejó fuera: otra tabla tiene el mismo nombre.',
                    leftOutEmpty:
                        'La tabla {{name}} se dejó fuera: no tiene campos.',
                    notSupportedFor:
                        'La exportación de SQL no es compatible con {{label}}',
                    notSupportedForDiagrams:
                        'La exportación de SQL no es compatible con los diagramas de {{label}}',
                    conversion: 'La conversión a {{label}} no es compatible',
                },
                check: {
                    empty: 'La expresión está vacía',
                    subQuery:
                        'No se permiten subconsultas en una restricción check',
                    keyword:
                        'La palabra clave {{word}} no está permitida en una restricción check',
                    extraParen: 'Paréntesis desbalanceados: sobra )',
                    openParen: 'Paréntesis desbalanceados: ( no está cerrado',
                    statements:
                        'No se permiten sentencias en una restricción check',
                    comments:
                        'No se permiten comentarios en una restricción check',
                },
                refusal: {
                    readOnly: 'Este diagrama no se puede editar',
                    nothingToUndo: 'No hay nada que deshacer',
                    nothingToRedo: 'No hay nada que rehacer',
                },
            },
            importing: {
                file: {
                    title: 'Abrir un diagrama guardado',
                    description:
                        'Elige un archivo .json guardado desde QBase. Se agrega como un diagrama nuevo.',
                    drop: 'Suelta un archivo aquí o haz clic para elegir uno',
                    action: 'Importar',
                    invalid:
                        'Ese archivo no es un diagrama guardado desde QBase, así que no se importó nada.',
                    failed: 'No se pudo importar el archivo. Inténtalo de nuevo.',
                },
                box: {
                    method: {
                        metadata: 'Consulta a la base de datos',
                        sql: 'Script SQL',
                        dbml: 'DBML',
                    },
                    field: {
                        metadata: 'Resultado de la consulta',
                        sql: 'Script SQL',
                        dbml: 'Texto DBML',
                    },
                    placeholder: {
                        metadata: 'Pega aquí el resultado de la consulta',
                        sql: 'Pega aquí las sentencias CREATE TABLE',
                        dbml: 'Pega aquí el DBML',
                    },
                    edition: 'Edición',
                    editionStandard: 'Estándar',
                    editions: {
                        supabase: 'Supabase',
                        timescale: 'Timescale',
                        mysql_5_7: 'MySQL 5.7',
                        sql_server_2016_and_below:
                            'SQL Server 2016 y anteriores',
                        cloudflare_d1: 'Cloudflare D1',
                    },
                    scriptIntro:
                        'Ejecuta la consulta en tu propio cliente de base de datos y pega abajo la única celda del resultado.',
                    copyScript: 'Copiar la consulta',
                    noScript:
                        'Todavía no hay una consulta predefinida para esta base de datos.',
                    scriptCopied: 'Consulta copiada',
                    copyFailed: 'Copiar no está disponible en este navegador',
                    truncated:
                        'El texto pegado tiene exactamente 65,535 caracteres, lo que normalmente significa que tu cliente lo cortó. Exporta la celda a un archivo en lugar de copiarla desde la cuadrícula.',
                    repair: 'Reparar el texto',
                    repairing: 'Reparando el texto...',
                    repaired: 'El texto se reparó.',
                    moreProblems_one: '{{count}} problema más',
                    moreProblems_other: '{{count}} problemas más',
                    moreProblems_many: '{{count}} de problemas más',
                    found: 'Se encontraron {{tables}} y {{links}}.',
                    foundTables_one: '{{count}} tabla',
                    foundTables_other: '{{count}} tablas',
                    foundTables_many: '{{count}} de tablas',
                    foundLinks_one: '{{count}} relación',
                    foundLinks_other: '{{count}} relaciones',
                    foundLinks_many: '{{count}} de relaciones',
                    nothing: 'No hay nada que importar en este texto.',
                },
                picker: {
                    title: 'Elige qué traer',
                    summary:
                        '{{selected}} de {{total}} elegidos (máximo {{limit}})',
                    search: 'Buscar por nombre',
                    kind: 'Tipo',
                    kindAll: 'Tablas y vistas',
                    kindTables: 'Solo tablas',
                    kindViews: 'Solo vistas',
                    schema: 'Esquema',
                    schemaAll: 'Todos los esquemas',
                    selectPage: 'Elegir todo en esta página',
                    viewTag: 'vista',
                    previous: 'Anterior',
                    next: 'Siguiente',
                    page: 'Página {{page}} de {{pages}}',
                },
                into: {
                    title: 'Agregar a este diagrama',
                    description:
                        'Las tablas nuevas se colocan a la derecha de lo que ya hay. Después se borra el historial.',
                    newTables_one: 'Se agregará {{count}} tabla.',
                    newTables_other: 'Se agregarán {{count}} tablas.',
                    newTables_many: 'Se agregarán {{count}} de tablas.',
                    newLinks_one: 'Se agregará {{count}} relación.',
                    newLinks_other: 'Se agregarán {{count}} relaciones.',
                    newLinks_many: 'Se agregarán {{count}} de relaciones.',
                    newTypes_one: 'Se agregará {{count}} tipo personalizado.',
                    newTypes_other:
                        'Se agregarán {{count}} tipos personalizados.',
                    newTypes_many:
                        'Se agregarán {{count}} de tipos personalizados.',
                    duplicates:
                        'Estas tablas ya existen y aparecerán dos veces: {{names}}',
                    apply: 'Agregar al diagrama',
                    done_one: 'Se agregó {{count}} tabla',
                    done_other: 'Se agregaron {{count}} tablas',
                    done_many: 'Se agregaron {{count}} de tablas',
                    failed: 'No se importó nada',
                },
            },
            exporting: {
                sql: {
                    title: 'SQL para {{database}}',
                    description:
                        'El script incluye las tablas que se muestran actualmente.',
                    script: 'Script generado',
                    copy: 'Copiar',
                    copied: 'Script copiado',
                    copyFailed: 'Copiar no está disponible en este navegador',
                    download: 'Descargar .sql',
                    nothing: 'Todavía no hay tablas que exportar.',
                },
                json: {
                    title: 'Guardar como archivo de diagrama',
                    description:
                        'El archivo conserva todo el diagrama y se puede volver a abrir desde la pantalla de diagrama nuevo.',
                    summary: '{{name}} (unos {{size}} KB)',
                    download: 'Descargar',
                },
                image: {
                    title: 'Guardar como {{format}}',
                    description:
                        'La imagen muestra todo el diagrama, con los colores que usas ahora.',
                    scale: 'Tamaño',
                    pattern: 'Dibujar el fondo punteado',
                    transparent: 'Fondo transparente',
                    jpegNote:
                        'JPEG no admite transparencia, así que se usa el color de la página.',
                    action: 'Guardar imagen',
                    working: 'Creando la imagen',
                    empty: 'Todavía no hay nada que poner en la imagen',
                    failed: 'No se pudo crear la imagen',
                },
            },
            settings: {
                title: 'Preferencias',
                description:
                    'Estas opciones pertenecen a este navegador, no al diagrama.',
                theme: 'Tema de color',
                themes: {
                    system: 'Igual que el sistema',
                    light: 'Claro',
                    dark: 'Oscuro',
                },
                language: 'Idioma',
                wheel: 'Rueda del ratón',
                wheelModes: {
                    pan: 'Mueve la vista',
                    zoom: 'Acerca y aleja la vista',
                },
                cardinality: 'Mostrar la cardinalidad de las relaciones',
                fieldAttributes: 'Mostrar los atributos de los campos',
                compactTables: 'Usar tablas compactas',
                minimap: 'Mostrar el minimapa',
                outlineOverlaps:
                    'Resaltar el contorno de las tablas superpuestas',
                views: 'Mostrar las vistas de la base de datos',
                shortcuts: 'Atajos de teclado',
            },
            sidePanel: {
                common: {
                    filter: 'Filtrar',
                    clearFilter: 'Borrar filtro',
                    focus: 'Enfocar en el lienzo',
                    more: 'Más acciones',
                    rename: 'Cambiar nombre',
                    saveName: 'Guardar nombre',
                    dragHandle: 'Arrastra para reordenar',
                    cancel: 'Cancelar',
                    confirm: 'Confirmar',
                    close: 'Cerrar',
                },
                tables: {
                    add: 'Agregar tabla',
                    addView: 'Agregar vista',
                    addMenu: 'Más formas de agregar',
                    empty: 'No hay tablas',
                    emptyHint: 'Crea una tabla para empezar',
                    noMatch:
                        'No se encontraron tablas que coincidan con tu filtro.',
                    allHidden: 'Todas las tablas están ocultas',
                    showAll: 'Mostrar todas',
                    actions: 'Acciones de la tabla',
                    changeSchema: 'Cambiar esquema',
                    addField: 'Agregar campo',
                    addIndex: 'Agregar índice',
                    duplicate: 'Duplicar tabla',
                    delete: 'Eliminar tabla',
                    renameTable: 'Cambiar el nombre de la tabla',
                    toggle: 'Mostrar u ocultar los detalles',
                    doubleClickToEdit: 'Haz doble clic para editar',
                    viewTag: 'Vista',
                    fields: 'Campos',
                    indexes: 'Índices',
                    checks: 'Restricciones check',
                    description: 'Descripción',
                    noDescription: 'Sin descripción',
                    color: 'Color de la tabla',
                    duplicateName:
                        'Ya hay otra tabla en este esquema con el nombre "{{name}}".',
                    selectSchema: {
                        title: 'Seleccionar esquema',
                        text: 'Se muestran varios esquemas. Elige uno para la tabla nueva.',
                        schema: 'Esquema',
                    },
                    changeSchemaDialog: {
                        title: 'Cambiar esquema',
                        text: 'Actualiza el esquema de la tabla "{{name}}".',
                        createNew: 'Crear un esquema nuevo',
                        newPlaceholder:
                            'Nombre del esquema nuevo, por ejemplo public',
                        change: 'Cambiar',
                    },
                },
                fields: {
                    add: 'Agregar campo',
                    linksRemoved:
                        'Relaciones eliminadas junto con el campo: {{count}}. Deshacer las recupera.',
                    name: 'Nombre del campo',
                    namePlaceholder: 'Nombre del campo',
                    typePlaceholder: 'Tipo',
                    typeSearch: 'Buscar tipos',
                    noTypes: 'No se encontraron tipos',
                    standardTypes: 'Tipos estándar',
                    customTypes: 'Tipos personalizados',
                    nullable: 'Permitir nulo',
                    nullableShort: 'N',
                    primaryKey: 'Clave primaria',
                    attributes: 'Atributos del campo',
                    unique: 'Único',
                    autoIncrement: 'Autoincremento',
                    array: 'Matriz',
                    maxLength: 'Longitud máxima',
                    lengthNone: 'Ninguna',
                    lengthMax: 'Máx.',
                    lengthCustom: 'Personalizada',
                    precision: 'Precisión',
                    scale: 'Escala',
                    default: 'Valor predeterminado',
                    noDefault: 'Sin valor predeterminado',
                    description: 'Descripción',
                    noDescription: 'Sin descripción',
                    delete: 'Eliminar campo',
                    showComment: 'Mostrar la descripción del campo',
                    foreignKey: 'Clave externa',
                    none: 'Esta tabla no tiene campos',
                },
                indexes: {
                    add: 'Agregar índice',
                    none: 'No hay índices',
                    selectFields: 'Seleccionar campos',
                    noFields: 'No se encontraron campos',
                    unique: 'Único',
                    attributes: 'Atributos del índice',
                    name: 'Nombre',
                    type: 'Tipo de índice',
                    description: 'Descripción',
                    noDescription: 'Sin descripción',
                    delete: 'Eliminar índice',
                    primaryKey: 'Clave primaria',
                    ginNeedsFields:
                        'Requiere campos array, json, jsonb, tsvector o hstore',
                },
                checks: {
                    add: 'Agregar restricción check',
                    none: 'No hay restricciones check',
                    unsupported:
                        'La exportación de SQL para esta base de datos omite las restricciones check',
                    expression: 'Expresión',
                    expressionPlaceholder: 'p. ej. price > 0',
                    attributes: 'Restricción check',
                    delete: 'Eliminar restricción check',
                },
                refs: {
                    filter: 'Filtrar',
                    add: 'Agregar relación',
                    collapseAll: 'Contraer todo',
                    relationships: 'Relaciones',
                    empty: 'No hay relaciones',
                    emptyHint: 'Crea una relación para empezar',
                    noMatch:
                        'No se encontraron relaciones que coincidan con tu filtro.',
                    primaryTable: 'Tabla primaria',
                    primaryField: 'Campo primario',
                    referencedTable: 'Tabla referenciada',
                    referencedField: 'Campo referenciado',
                    relatedTable: 'Tabla relacionada',
                    relatedField: 'Campo relacionado',
                    cardinality: 'Cardinalidad',
                    oneToOne: 'Uno a uno',
                    oneToMany: 'Uno a muchos',
                    manyToOne: 'Muchos a uno',
                    switchTables: 'Intercambiar tablas',
                    delete: 'Eliminar',
                    dialog: {
                        title: 'Crear relación',
                        selectTable: 'Seleccionar tabla',
                        selectField: 'Seleccionar campo',
                        noTables: 'No se encontraron tablas',
                        noFields: 'No se encontraron campos',
                        create: 'Crear',
                    },
                    toast: {
                        incompatibleTitle:
                            'Los tipos de campo no son compatibles',
                        incompatibleText:
                            'Solo se pueden crear relaciones entre tipos de campo compatibles',
                        existsTitle: 'Ya están conectados',
                        existsText:
                            'Estos dos campos ya tienen una relación entre ellos',
                        failedTitle: 'No se pudo crear la relación',
                        failedText: 'Elige dos campos de dos tablas distintas.',
                    },
                },
                userTypes: {
                    add: 'Tipo nuevo',
                    empty: 'No hay tipos personalizados',
                    emptyHint:
                        'Los tipos personalizados aparecerán aquí cuando estén disponibles en tu base de datos',
                    noMatch:
                        'No se encontraron tipos personalizados que coincidan con tu filtro.',
                    actions: 'Acciones',
                    delete: 'Eliminar',
                    rename: 'Cambiar el nombre del tipo',
                    kind: 'Clase',
                    enum: 'Enum',
                    composite: 'Compuesto',
                    valuePlaceholder: 'Agregar valor de enum...',
                    addValue: 'Agregar valor',
                    removeValue: 'Quitar {{value}}',
                    noValues: 'No hay valores de enum definidos',
                    memberName: 'Nombre del campo',
                    memberType: 'Seleccionar tipo',
                    addMember: 'Agregar campo',
                    removeMember: 'Quitar campo',
                    noMembers: 'No hay campos definidos',
                },
                visuals: {
                    areas: 'Áreas',
                    notes: 'Notas',
                    areaFilter: 'Filtrar',
                    addArea: 'Agregar área',
                    noAreas: 'No hay áreas',
                    noAreasHint: 'Crea un área para empezar',
                    noAreasMatch:
                        'No se encontraron áreas que coincidan con tu filtro.',
                    areaActions: 'Acciones del área',
                    editName: 'Editar nombre',
                    deleteArea: 'Eliminar área',
                    addNote: 'Agregar nota',
                    noNotes: 'No hay notas',
                    noNotesHint:
                        'Crea una nota para agregar anotaciones de texto en el lienzo',
                    noNotesMatch: 'No se encontraron notas',
                    emptyNote: 'Nota vacía',
                    noteActions: 'Acciones de la nota',
                    deleteNote: 'Eliminar nota',
                    colour: 'Color',
                },
                filters: {
                    title: 'Filtrar tablas',
                    search: 'Buscar tablas...',
                    groupBySchema: 'Agrupar por esquema',
                    groupByArea: 'Agrupar por área',
                    show: 'Mostrar',
                    hide: 'Ocultar',
                    zoomTo: 'Acercar a {{name}}',
                    noTables: 'No se encontraron tablas',
                    tryAdjusting: 'Prueba a ajustar tu búsqueda o filtro',
                    createToStart: 'Crea una tabla para empezar',
                    noSchema: 'Sin esquema',
                    noArea: 'Sin área',
                    showAllShort: 'Mostrar todas las tablas',
                },
                hover: {
                    type: 'tipo',
                    nullability: 'nulo',
                    nullable: 'admite nulo',
                    notNull: 'NOT NULL',
                    key: 'clave',
                    primaryKey: 'clave primaria',
                    unique: 'único',
                    autoIncrement: 'autoincremento',
                    default: 'predeterminado',
                    check: 'check',
                    references: 'referencia a',
                    referencedBy: 'referenciado por',
                },
                clipboard: {
                    copied: 'Tabla copiada',
                    copiedMany: '{{count}} tablas copiadas',
                    pasteHint: 'Pulsa {{key}} para pegarla.',
                    pasted: 'Tabla pegada',
                    pastedMany: '{{count}} tablas pegadas',
                },
                dbml: {
                    title: 'DBML',
                    empty: 'Todavía no hay nada que mostrar',
                    copy: 'Copiar',
                    standardRefs: 'Mostrar refs estándar',
                    inlineRefs: 'Mostrar refs en línea',
                    copied: 'Copiado',
                    failed: 'No se pudo escribir el DBML',
                    edit: 'Editar',
                    view: 'Ver',
                    accept: 'Aceptar cambios',
                    undo: 'Deshacer cambios',
                    editor: 'Texto DBML',
                    parseError:
                        'No se pudo analizar el DBML. Revisa la sintaxis. (1 error encontrado, en la línea {{line}})',
                    parseErrorNoLine:
                        'No se pudo analizar el DBML. Revisa la sintaxis. (1 error encontrado)',
                    summary:
                        'Tablas: {{added}} nuevas, {{removed}} eliminadas, {{changed}} modificadas; relaciones: {{linksAdded}} nuevas, {{linksRemoved}} eliminadas',
                    rejected: 'No se pudo aplicar el cambio',
                    applying: 'Aplicando cambios...',
                    leftOut: 'Excluido de la exportación',
                    errorText: '// Error al generar el DBML: {{message}}',
                    errorToast: 'Error al exportar el DBML',
                },
            },
        },
        canvas: {
            surface: {
                label: 'Lienzo del diagrama',
                loading: 'Cargando el diagrama...',
            },
            snap: {
                label: 'Ajustar a la cuadrícula (mantén {{key}})',
            },
            overlap: {
                label: 'Resaltar tablas superpuestas',
            },
            highlight: {
                label: 'Resaltando "{{name}}": haz clic para quitarlo',
            },
            toolbar: {
                label: 'Herramientas del lienzo',
                filter: 'Filtrar tablas ({{shortcut}})',
                showAll: 'Mostrar todas ({{shortcut}})',
                zoomOut: 'Alejar',
                zoomIn: 'Acercar',
                zoomReset: 'Restablecer el zoom al 100 %',
                arrange: 'Organizar el diagrama automáticamente',
                undo: 'Deshacer ({{shortcut}})',
                redo: 'Rehacer ({{shortcut}})',
                fullScreen: 'Pantalla completa',
                exitFullScreen: 'Salir de pantalla completa',
            },
            showAllPill: 'Mostrar todas',
            hiddenAll: {
                title: 'Todas las tablas están ocultas',
                action: 'Mostrar todas',
            },
            diff: {
                added: 'Tabla nueva',
                removed: 'Tabla eliminada',
                changed: 'Tabla modificada',
            },
            entity: {
                view: 'vista',
                materializedView: 'vista materializada',
                fieldCount_other: '{{count}} campos',
                fieldCount_many: '{{count}} de campos',
                fieldCount_one: '{{count}} campo',
                openInPanel: 'Abrir en el panel lateral',
                widen: 'Hacer más ancha',
                narrow: 'Hacer más estrecha',
                showMore: 'Mostrar más',
                showLess: 'Mostrar menos',
                edit: 'Editar tabla',
                unique: 'UQ',
                nullable: 'Puede estar vacío',
                required: 'Obligatorio',
                primaryKey: 'Clave primaria',
                foreignKey: 'Clave externa',
            },
            fieldCard: {
                type: 'Tipo',
                nullable: 'Admite nulo',
                notNull: 'No nulo',
                unique: 'Único',
                primaryKey: 'Clave primaria',
                default: 'Predeterminado',
                references: 'referencia a {{table}}.{{field}}',
                referencedBy: 'referenciado por {{table}}.{{field}}',
            },
            link: {
                label: 'Relación {{name}}',
                select: 'Relación seleccionada',
                popover: {
                    oneToOne: '1:1',
                    oneToMany: '1:N',
                    switch: 'Intercambiar tablas',
                    openInPanel: 'Abrir en el panel lateral',
                    remove: 'Eliminar relación',
                },
                incompatible: {
                    title: 'Los tipos de campo no son compatibles',
                    text: 'Solo se pueden crear relaciones entre tipos de campo compatibles',
                },
                exists: {
                    title: 'Ya están conectados',
                    text: 'Estos dos campos ya tienen una relación entre ellos',
                },
            },
            region: {
                rename: 'Nombre del área',
                colour: 'Color del área',
            },
            memo: {
                placeholder: 'Nota vacía',
                edit: 'Texto de la nota',
                colour: 'Color de la nota',
            },
            menu: {
                newTable: 'Tabla nueva',
                newView: 'Vista nueva',
                newRelationship: 'Relación nueva',
                newArea: 'Área nueva',
                newNote: 'Nota nueva',
                arrange: 'Organizar el diagrama automáticamente',
                moveToArea: 'Mover a un área',
                moveToAreaCount: 'Mover a un área ({{count}})',
                noArea: 'Sin área',
                editTable: 'Editar tabla',
                duplicateTable: 'Duplicar tabla',
                addRelationship: 'Agregar relación',
                deleteTable: 'Eliminar tabla',
                deleteTables: 'Eliminar tablas ({{count}})',
                editAreaName: 'Editar nombre del área',
                arrangeArea: 'Organizar automáticamente',
                deleteArea: 'Eliminar área',
            },
            arrange: {
                title: 'Organizar el diagrama automáticamente',
                text: 'Esta acción reorganizará todas las tablas del diagrama. ¿Quieres continuar?',
                confirm: 'Organizar automáticamente',
                cancel: 'Cancelar',
            },
            clipboard: {
                copiedOne: 'Tabla copiada',
                copiedMany: '{{count}} tablas copiadas',
                hint: 'Pulsa {{key}} para pegarla.',
                pastedOne: 'Tabla pegada',
                pastedMany: '{{count}} tablas pegadas',
                failed: 'No se pudo copiar',
            },
            drawing: {
                hint: 'Haz clic en la tabla que contiene la clave externa',
            },
            keys: {
                mod: 'Ctrl',
                modMac: '⌘',
            },
        },
    },
};
