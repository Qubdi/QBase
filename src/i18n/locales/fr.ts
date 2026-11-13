import { fr as frQubdi } from '../qubdi-locales/fr';

export const fr = {
    translation: {
        editor: {
            common: {
                copyFailed: {
                    title: 'Échec de la copie',
                    unsupported: 'Presse-papiers non pris en charge.',
                    generic: 'Une erreur s’est produite. Veuillez réessayer.',
                },
                cancel: 'Annuler',
                close: 'Fermer',
                back: 'Retour',
                continue: 'Continuer',
                loading: 'Chargement',
                app: {
                    title: 'QBase – Diagrammes de schéma de base de données',
                    description:
                        'Diagrammes de schéma de base de données : importez une base en service, publiez des versions, partagez des liens en lecture seule, resynchronisez et détectez les écarts.',
                },
                notFound: {
                    title: 'Il manque quelque chose.',
                    body: "Nous n'avons pas trouvé la page demandée. Elle a peut-être été déplacée, ou le lien est incorrect.",
                },
                problem: {
                    title: 'Un problème est survenu.',
                    body: 'La page n’a pas pu s’afficher. Rechargez pour réessayer ; vos diagrammes enregistrés ne sont pas affectés.',
                    reload: 'Recharger',
                },
                colorPicker: {
                    change: 'Changer la couleur',
                    use: 'Utiliser',
                    useColor: 'Utiliser {{color}}',
                    remove: 'Retirer {{color}}',
                    yourColors: 'Vos couleurs',
                    pickCustom: 'Choisir une couleur personnalisée',
                    hex: 'Couleur hexadécimale',
                    hexPlaceholder: '#rrggbb',
                    invalid:
                        'Saisissez une couleur hexadécimale, par exemple #8eb7ff.',
                },
            },
            workspace: {
                frame: {
                    resizePanel: 'Redimensionner le panneau latéral',
                    openPanel: "Ouvrir le panneau d'édition",
                },
                canvas: {
                    editTable: 'Modifier la table {{name}}',
                    tableName: 'Nom de la table',
                    done: 'Terminé',
                    schema: 'Schéma',
                    createSchema: 'Créer un nouveau schéma',
                    newSchemaName: 'Nom du nouveau schéma',
                    openInPanel: 'Ouvrir dans le panneau latéral',
                    fieldCount_one: '{{count}} champ',
                    fieldCount_other: '{{count}} champs',
                    fieldCount_many: '{{count}} champs',
                    loading: 'Chargement du diagramme...',
                    link: {
                        title: 'Nouvelle relation',
                        from: 'Depuis {{table}}.{{field}}',
                        target: 'Champ dans {{table}}',
                        newField: 'Nouveau champ',
                        newFieldName: 'Nom du nouveau champ',
                        create: 'Créer',
                        cancel: 'Annuler',
                        noKey: "La première table n'a pas de clé primaire de départ.",
                        noField:
                            'Choisissez un champ ou donnez un nom au nouveau champ.',
                        noLink: 'Ces champs ne peuvent pas être reliés.',
                    },
                },
                navbar: {
                    home: 'Accueil QBase',
                    language: 'Changer de langue',
                    searchLanguage: 'Rechercher une langue',
                    showTools: "Afficher la barre d'outils",
                    hideTools: "Masquer la barre d'outils",
                    sidebarTitle: 'Barre latérale',
                    sidebarDescription: 'Affiche la barre latérale mobile.',
                },
                name: {
                    label: 'Nom du diagramme',
                    confirm: 'Conserver ce nom',
                    rename: 'Renommer le diagramme',
                    hint: 'Double-cliquez pour renommer',
                },
                menu: {
                    label: "Menus de l'éditeur",
                    diagram: {
                        label: 'Diagramme',
                        import: 'Importer depuis',
                        importFile: 'Fichier de diagramme (.json)',
                        importSql: 'Script SQL',
                        importDbml: 'Texte DBML',
                        exportSql: 'Exporter le SQL pour',
                        saveAs: 'Enregistrer sous',
                        png: 'Image PNG',
                        jpeg: 'Image JPEG',
                        svg: 'Image SVG',
                        json: 'Fichier de diagramme (.json)',
                        delete: 'Supprimer ce diagramme',
                    },
                    edit: {
                        label: 'Édition',
                        undo: 'Annuler',
                        redo: 'Rétablir',
                        clear: 'Vider le diagramme',
                    },
                    view: {
                        label: 'Affichage',
                        sidePanel: 'Masquer la barre latérale',
                        sidePanelShow: 'Afficher la barre latérale',
                        cardinality: 'Masquer la cardinalité',
                        cardinalityShow: 'Afficher la cardinalité',
                        fieldAttributes: 'Masquer les attributs des champs',
                        fieldAttributesShow:
                            'Afficher les attributs des champs',
                        compactTables: 'Tables compactes',
                        compactTablesStandard: 'Tables standard',
                        minimap: 'Masquer la minicarte',
                        minimapShow: 'Afficher la minicarte',
                        views: 'Vues de la base de données',
                        wheel: 'Zoom au défilement',
                        on: 'Activé',
                        off: 'Désactivé',
                        theme: 'Thème de couleurs',
                        themes: {
                            system: 'Système',
                            light: 'Clair',
                            dark: 'Sombre',
                        },
                    },
                    backup: {
                        label: 'Sauvegarde',
                        export: 'Exporter le diagramme',
                        restore: 'Restaurer le diagramme',
                    },
                },
                rail: {
                    label: "Sections de l'éditeur",
                    new: 'Nouveau',
                    browse: 'Ouvrir',
                    tables: 'Tables',
                    dbml: 'DBML',
                    refs: 'Relations',
                    customTypes: 'Types',
                    visuals: 'Extras',
                },
                drawer: {
                    title: 'Gérer le diagramme',
                    description: 'Gérez les objets de votre diagramme',
                    sections: 'Section',
                    viewAll: 'Voir toutes les options...',
                    entries: {
                        tables: 'Tables',
                        dbml: 'DBML',
                        refs: 'Relations',
                        customTypes: 'Types personnalisés',
                        areas: 'Zones',
                        notes: 'Notes',
                    },
                },
                toasts: {
                    saved: 'Tout est enregistré',
                    saving: 'Enregistrement de vos dernières modifications',
                },
                shortcuts: {
                    undo: 'Annuler',
                    redo: 'Rétablir',
                    openDiagram: 'Ouvrir un diagramme',
                    save: 'Confirmer que les modifications sont enregistrées',
                    togglePanel: 'Afficher ou masquer le panneau latéral',
                    fitAll: 'Ajuster la vue à toutes les tables',
                    toggleTheme: 'Basculer entre clair et sombre',
                    toggleFilter: 'Afficher ou masquer le filtre des tables',
                    copyTables: 'Copier les tables sélectionnées',
                    pasteTables: 'Coller les tables copiées',
                    removeSelection: 'Supprimer la sélection',
                },
            },
            designs: {
                defaultName: 'Diagramme {{number}}',
                create: {
                    titleType: 'Pour quelle base de données ?',
                    descriptionType:
                        'Ce choix reste attaché au diagramme. Sélectionnez-en un pour continuer.',
                    titleImport: "Partir d'un travail existant",
                    descriptionImport:
                        'Collez un schéma pour y construire le diagramme, ou commencez avec un diagramme vide.',
                    fromFile: 'Ouvrir un fichier enregistré',
                    empty: 'Diagramme vide',
                    checkExamples: 'Voir les exemples',
                    titleExamples: 'Exemples',
                    descriptionExamples:
                        'Partez d’un petit diagramme conçu pour une base de données. Choisissez-en un pour l’ouvrir comme nouveau diagramme.',
                    emptyFromImport: 'Diagramme vide à la place',
                    import: 'Créer à partir du texte',
                    failed: "Le diagramme n'a pas pu être créé. Veuillez réessayer.",
                },
                examples: {
                    clinic: 'Patients, médecins et spécialités, avec les rendez-vous et les médicaments prescrits lors de ceux-ci.',
                    bookshop:
                        'Auteurs, catégories et livres, avec les clients, leurs commandes et les articles de chaque commande.',
                    library:
                        'Succursales, membres et documents empruntables, avec les prêts et les réservations.',
                    habits: 'Personnes, leurs habitudes et leurs validations quotidiennes, avec rappels et étiquettes.',
                    hotel: 'Hôtels, types de chambres et chambres, avec clients, réservations et paiements.',
                    airline:
                        'Aéroports, avions et vols, avec passagers, réservations et billets.',
                },
                open: {
                    title: 'Vos diagrammes',
                    description:
                        'Tout ce qui est stocké dans ce navigateur, les plus récemment modifiés en premier.',
                    search: 'Rechercher par nom',
                    empty: "Aucun diagramme n'est encore stocké ici.",
                    noMatch: 'Aucun diagramme ne porte ce nom.',
                    columns: {
                        name: 'Nom',
                        created: 'Créé',
                        changed: 'Modifié',
                        tables: 'Tables',
                        actions: 'Actions',
                    },
                    actionsFor: 'Actions pour {{name}}',
                    rowOpen: 'Ouvrir',
                    rowRename: 'Renommer',
                    rowDuplicate: 'Faire une copie',
                    rowDelete: 'Supprimer',
                    newDatabase: 'Nouveau diagramme',
                    open: 'Ouvrir le diagramme',
                    copySuffix: '(copie)',
                    duplicated: '{{name}} créé',
                },
                rename: {
                    title: 'Renommer le diagramme',
                    description:
                        'Choisissez un nouveau nom. Laissez vide pour conserver le nom actuel.',
                    label: 'Nom du diagramme',
                    save: 'Renommer',
                },
                delete: {
                    title: 'Supprimer ce diagramme ?',
                    description:
                        'Cette action est irréversible. Le diagramme sera définitivement supprimé.',
                    confirm: 'Supprimer',
                    failed: "Le diagramme n'a pas pu être supprimé",
                },
                clear: {
                    title: 'Vider le diagramme ?',
                    description:
                        "Toutes les tables, relations et notes seront supprimées et l'historique sera perdu. Le diagramme lui-même est conservé. Cette action est irréversible.",
                    confirm: 'Vider',
                    failed: "Le diagramme n'a pas pu être vidé",
                },
            },
            diagnostics: {
                withLine: 'Ligne {{line}} : {{text}}',
                found_one: '{{count}} table trouvée',
                found_other: '{{count}} tables trouvées',
                found_many: '{{count}} tables trouvées',
                foundViews_one: '{{count}} vue',
                foundViews_other: '{{count}} vues',
                foundViews_many: '{{count}} vues',
                foundWithViews: '{{tables}} et {{views}} à importer.',
                foundOnly: '{{tables}} à importer.',
                nothingToImport: 'Rien à importer',
                invalidJson:
                    'JSON non valide. Corrigez-le ou contactez-nous à support@qubdi.com.',
                nothingToExport: 'Rien à exporter',
                emptyScript: 'Le script SQL est vide',
                noStatements: 'Aucune instruction SQL valide trouvée',
                addCreateTable:
                    'Ajoutez des instructions CREATE TABLE à importer',
                noSemicolon:
                    'Les instructions SQL doivent se terminer par un point-virgule (;)',
                unterminatedComment: 'Commentaire de bloc non terminé',
                closeComment: 'Fermez le commentaire avec */',
                unterminatedText: 'Texte entre guillemets non terminé',
                closeText: 'Fermez le texte avec {{quote}}',
                unmatchedParen: 'Parenthèse fermante sans parenthèse ouvrante',
                unclosedParen: 'Parenthèse non fermée',
                dialectSyntax: {
                    serialMysql:
                        "SERIAL n'est pas valide dans MySQL, utilisez AUTO_INCREMENT",
                    identityMysql:
                        "GENERATED ... AS IDENTITY n'est pas valide dans MySQL, utilisez AUTO_INCREMENT",
                    sqlServerIdentityMysql:
                        'IDENTITY(a,b) est la syntaxe de SQL Server, utilisez AUTO_INCREMENT',
                    autoIncrementSqlServer:
                        'AUTO_INCREMENT est la syntaxe de MySQL, utilisez IDENTITY(1,1)',
                    serialSqlServer:
                        'SERIAL est la syntaxe de PostgreSQL, utilisez IDENTITY(1,1)',
                    identitySqlServer:
                        "GENERATED ... AS IDENTITY n'est pas valide dans SQL Server, utilisez IDENTITY(1,1)",
                    ifNotExistsSqlServer:
                        "CREATE TABLE IF NOT EXISTS n'est pas valide en T-SQL",
                    schemaSqlite:
                        "CREATE SCHEMA n'est pas pris en charge dans SQLite",
                    removeSchemaSqlite:
                        'Supprimez les instructions de création de schéma pour SQLite',
                    enumSqlite:
                        "ENUM n'est pas pris en charge dans SQLite, utilisez une contrainte CHECK",
                    autoIncrementSqlite:
                        'AUTO_INCREMENT est la syntaxe de MySQL, utilisez AUTOINCREMENT',
                    serialSqlite:
                        'SERIAL est la syntaxe de PostgreSQL, utilisez INTEGER PRIMARY KEY AUTOINCREMENT',
                    identitySqlite:
                        "GENERATED ... AS IDENTITY n'est pas valide dans SQLite, utilisez AUTOINCREMENT",
                    sqlServerIdentitySqlite:
                        'IDENTITY(a,b) est la syntaxe de SQL Server, utilisez AUTOINCREMENT',
                    inlineReferencesMysql:
                        'MySQL ne prend pas en charge REFERENCES en ligne dans les définitions de colonnes (ligne {{line}}). Utilisez plutôt des contraintes FOREIGN KEY :',
                },
                postgres: {
                    brokenCast:
                        'Opérateur de conversion non valide ": :" trouvé. PostgreSQL utilise "::" pour la conversion de type.',
                    fixCast: 'Remplacez ": :" par "::"',
                    splitDecimal:
                        "Le type DECIMAL est réparti sur plusieurs lignes. Cela peut provoquer des erreurs d'analyse.",
                    fixDecimal:
                        "Placez la précision et l'échelle sur une seule ligne",
                    extension:
                        "CREATE EXTENSION trouvé. Ces instructions seront ignorées à l'import.",
                    functions:
                        "Définitions de fonctions trouvées. Elles seront ignorées à l'import.",
                    triggers:
                        'Définitions de déclencheurs trouvées. Elles ne seront pas importées.',
                    large: "Fichier SQL volumineux détecté ({{count}} instructions). L'import peut prendre un certain temps.",
                    postgis:
                        "Types géographiques PostGIS détectés. Ils seront importés, mais les données géométriques risquent de ne pas s'afficher.",
                },
                import: {
                    viewNoColumns:
                        "La vue {{name}} n'a aucune colonne lisible à partir de sa définition.",
                    skipped_one:
                        '{{count}} instruction {{kind}} ignorée : non importée.',
                    skipped_other:
                        '{{count}} instructions {{kind}} ignorées : non importées.',
                    skipped_many:
                        '{{count}} instructions {{kind}} ignorées : non importées.',
                    linkTableMissing:
                        "Clé étrangère de {{table}} abandonnée : la table {{ref}} n'est pas dans le script.",
                    linkColumnsMismatch:
                        'Clé étrangère de {{table}} abandonnée : ses colonnes ne correspondent pas.',
                    linkNamedMissing:
                        'Clé étrangère {{name}} abandonnée : une table ou une colonne est manquante.',
                    rowsDropped_one:
                        "{{count}} ligne de clé étrangère abandonnée : une table ou une colonne n'est pas dans l'import.",
                    rowsDropped_other:
                        "{{count}} lignes de clé étrangère abandonnées : une table ou une colonne n'est pas dans l'import.",
                    rowsDropped_many:
                        "{{count}} lignes de clé étrangère abandonnées : une table ou une colonne n'est pas dans l'import.",
                    unsupportedType:
                        'Type de base de données non pris en charge',
                    invalidDbml: 'DBML non valide',
                    invalidRelationship:
                        'Relation non valide : tables ou champs introuvables',
                    manyToMany:
                        'Les références plusieurs-à-plusieurs (<>) ne sont pas prises en charge : « {{left}} » et « {{right}} ». Ajoutez une table de jonction qui référence les deux.',
                    missingIndexColumn:
                        "L'index référence une colonne inexistante : {{name}}",
                    invalidCheck:
                        'Contrainte de vérification non valide sur {{name}} : {{problem}}',
                    arrayType:
                        "Les types tableau ne sont pas pris en charge pour une base {{dialect}}. Le champ « {{field}} » a le type tableau « {{type}} », ce qui n'est pas autorisé.",
                },
                export: {
                    lostFields_one:
                        'La table {{name}} a perdu {{count}} champ sans nom.',
                    lostFields_other:
                        'La table {{name}} a perdu {{count}} champs sans nom.',
                    lostFields_many:
                        'La table {{name}} a perdu {{count}} champs sans nom.',
                    leftOutDuplicate:
                        'La table {{name}} a été omise : une autre table porte le même nom.',
                    leftOutEmpty:
                        "La table {{name}} a été omise : elle n'a aucun champ.",
                    notSupportedFor:
                        "L'export SQL n'est pas pris en charge pour {{label}}",
                    notSupportedForDiagrams:
                        "L'export SQL n'est pas pris en charge pour les diagrammes {{label}}",
                    conversion:
                        "La conversion vers {{label}} n'est pas prise en charge",
                },
                check: {
                    empty: "L'expression est vide",
                    subQuery:
                        'Les sous-requêtes ne sont pas autorisées dans une vérification',
                    keyword:
                        "Le mot-clé {{word}} n'est pas autorisé dans une vérification",
                    extraParen: 'Parenthèses non appariées : ) en trop',
                    openParen: "Parenthèses non appariées : ( n'est pas fermée",
                    statements:
                        'Les instructions ne sont pas autorisées dans une vérification',
                    comments:
                        'Les commentaires ne sont pas autorisés dans une vérification',
                },
                refusal: {
                    readOnly: 'Ce diagramme ne peut pas être modifié',
                    nothingToUndo: 'Rien à annuler',
                    nothingToRedo: 'Rien à rétablir',
                },
            },
            importing: {
                file: {
                    title: 'Ouvrir un diagramme enregistré',
                    description:
                        'Choisissez un fichier .json enregistré depuis QBase. Il est ajouté comme nouveau diagramme.',
                    drop: 'Déposez un fichier ici, ou cliquez pour en choisir un',
                    types: 'Types pris en charge : .json',
                    action: 'Importer',
                    invalid:
                        "Ce fichier n'est pas un diagramme enregistré depuis QBase, rien n'a donc été importé.",
                    failed: "Le fichier n'a pas pu être importé. Veuillez réessayer.",
                    tooLarge:
                        'Le fichier est trop volumineux (50 Mo au maximum).',
                },
                box: {
                    method: {
                        metadata: 'Smart Query',
                        sql: 'Script SQL',
                        dbml: 'DBML',
                    },
                    field: {
                        metadata: 'Résultat de la requête',
                        sql: 'Script SQL',
                        dbml: 'Texte DBML',
                    },
                    placeholder: {
                        metadata: 'Collez ici le résultat de la requête',
                        sql: 'Collez ici les instructions CREATE TABLE',
                        dbml: 'Collez ici le DBML',
                    },
                    edition: 'Édition de la base de données :',
                    editionStandard: 'Standard',
                    methodLabel: 'Comment souhaitez-vous importer ?',
                    instructions: 'Instructions :',
                    pasteHere: {
                        metadata:
                            '2. Collez le résultat du script dans cette fenêtre →',
                        sql: '3. Ouvrez le fichier SQL exporté, copiez son contenu et collez-le ici.',
                        dbml: 'Collez ici votre définition de schéma DBML (Database Markup Language) →',
                    },
                    dbClient: 'Client BD',
                    psql: 'PSQL',
                    psqlSave:
                        'Enregistrez le script dans un fichier, puis exécutez :',
                    sqlInstall: '1. Installez {{tool}}.',
                    sqlRun: '2. Exécutez la commande suivante dans votre terminal (préfixez avec sudo sous Linux si nécessaire) :',
                    example: 'Exemple :',
                    resize: "Redimensionner le panneau d'instructions",
                    needHelp: "Besoin d'aide ? Regardez comment faire",
                    helpBody:
                        'Copiez le script, exécutez-le dans votre base de données, collez le résultat dans la zone de droite, puis cliquez sur Importer.',
                    output: {
                        metadata: 'Résultat de la Smart Query',
                        sql: 'Script SQL',
                        dbml: 'Script DBML',
                    },
                    editions: {
                        supabase: 'Supabase',
                        timescale: 'Timescale',
                        mysql_5_7: 'MySQL 5.7',
                        sql_server_2016_and_below:
                            'SQL Server 2016 et antérieur',
                        cloudflare_d1: 'Cloudflare D1',
                    },
                    scriptIntro:
                        '1. Exécutez ce script dans votre base de données :',
                    copyScript: 'Copier la requête',
                    noScript:
                        "Aucune requête prête à l'emploi n'est encore fournie pour cette base de données.",
                    scriptCopied: 'Requête copiée',
                    truncated:
                        "Le texte collé fait exactement 65 535 caractères, ce qui signifie généralement que votre client l'a tronqué. Exportez la cellule dans un fichier au lieu de la copier depuis la grille.",
                    repair: 'Réparer le texte',
                    repairing: 'Réparation du texte...',
                    repaired: 'Le texte a été réparé.',
                    moreProblems_one: '{{count}} autre problème',
                    moreProblems_other: '{{count}} autres problèmes',
                    moreProblems_many: '{{count}} autres problèmes',
                    found: '{{tables}} et {{links}} trouvées.',
                    foundTables_one: '{{count}} table',
                    foundTables_other: '{{count}} tables',
                    foundTables_many: '{{count}} tables',
                    foundLinks_one: '{{count}} relation',
                    foundLinks_other: '{{count}} relations',
                    foundLinks_many: '{{count}} relations',
                    nothing: 'Ce texte ne contient rien à importer.',
                },
                picker: {
                    title: "Choisir ce qu'il faut importer",
                    summary:
                        '{{selected}} sur {{total}} sélectionnés (maximum {{limit}})',
                    search: 'Rechercher par nom',
                    kind: 'Type',
                    kindAll: 'Tables et vues',
                    kindTables: 'Tables uniquement',
                    kindViews: 'Vues uniquement',
                    schema: 'Schéma',
                    schemaAll: 'Tous les schémas',
                    selectPage: 'Tout sélectionner sur cette page',
                    viewTag: 'vue',
                    previous: 'Précédent',
                    next: 'Suivant',
                    page: 'Page {{page}} sur {{pages}}',
                },
                into: {
                    title: 'Ajouter à ce diagramme',
                    description:
                        "Les nouvelles tables sont placées à droite de celles qui existent déjà. L'historique est ensuite effacé.",
                    newTables_one: '{{count}} table sera ajoutée.',
                    newTables_other: '{{count}} tables seront ajoutées.',
                    newTables_many: '{{count}} tables seront ajoutées.',
                    newLinks_one: '{{count}} relation sera ajoutée.',
                    newLinks_other: '{{count}} relations seront ajoutées.',
                    newLinks_many: '{{count}} relations seront ajoutées.',
                    newTypes_one: '{{count}} type personnalisé sera ajouté.',
                    newTypes_other:
                        '{{count}} types personnalisés seront ajoutés.',
                    newTypes_many:
                        '{{count}} types personnalisés seront ajoutés.',
                    duplicates:
                        'Ces tables existent déjà et apparaîtront en double : {{names}}',
                    apply: 'Ajouter au diagramme',
                    done_one: '{{count}} table ajoutée',
                    done_other: '{{count}} tables ajoutées',
                    done_many: '{{count}} tables ajoutées',
                    failed: "Rien n'a été importé",
                },
            },
            exporting: {
                sql: {
                    title: 'Exporter en SQL',
                    description:
                        'Exporter le schéma de votre diagramme en script {{database}}',
                    script: 'Script généré',
                    copy: 'Copier',
                    copied: 'Script copié',
                    download: 'Télécharger le .sql',
                    nothing: "Il n'y a pas encore de table à exporter.",
                },
                json: {
                    title: 'Enregistrer comme fichier de diagramme',
                    description:
                        "Le fichier conserve tout le diagramme et peut être rouvert depuis l'écran de nouveau diagramme.",
                    summary: '{{name}} (environ {{size}} Ko)',
                    download: 'Télécharger',
                },
                image: {
                    title: "Exporter l'image",
                    description:
                        "L'image montre tout le diagramme, dans les couleurs que vous utilisez actuellement.",
                    scale: 'Échelle',
                    scaleBest: '{{scale}}x (Meilleure qualité)',
                    advanced: 'Options avancées',
                    patternHelp: "Ajouter une trame discrète à l'arrière-plan.",
                    transparentHelp:
                        "Supprimer la couleur d'arrière-plan de l'image.",
                    pattern: "Dessiner l'arrière-plan en pointillés",
                    transparent: 'Arrière-plan transparent',
                    jpegNote:
                        'Le JPEG ne peut pas être transparent, la couleur de la page est donc utilisée.',
                    action: "Enregistrer l'image",
                    working: "Création de l'image",
                    empty: "Il n'y a encore rien à mettre dans l'image",
                    failed: "L'image n'a pas pu être créée",
                    lowered:
                        "L'image est très grande, elle a donc été créée à {{scale}}x pour respecter la limite du navigateur",
                },
            },
            settings: {
                title: 'Préférences',
                description:
                    'Ces choix sont propres à ce navigateur, pas au diagramme.',
                theme: 'Thème de couleurs',
                themes: {
                    system: 'Comme le système',
                    light: 'Clair',
                    dark: 'Sombre',
                },
                language: 'Langue',
                wheel: 'Molette de la souris',
                wheelModes: {
                    pan: 'Déplace la vue',
                    zoom: 'Zoome la vue',
                },
                cardinality: 'Afficher la cardinalité des relations',
                fieldAttributes: 'Afficher les attributs des champs',
                compactTables: 'Utiliser des tables compactes',
                minimap: 'Afficher la minicarte',
                outlineOverlaps: 'Entourer les tables qui se chevauchent',
                views: 'Afficher les vues de la base de données',
                shortcuts: 'Raccourcis clavier',
            },
            sidePanel: {
                common: {
                    filter: 'Filtrer',
                    clearFilter: 'Effacer le filtre',
                    focus: 'Centrer sur le canevas',
                    saveName: 'Enregistrer le nom',
                    dragHandle: 'Faire glisser pour réorganiser',
                    cancel: 'Annuler',
                    confirm: 'Confirmer',
                    close: 'Fermer',
                    customColor: 'Couleur personnalisée',
                },
                tables: {
                    add: 'Ajouter une table',
                    addView: 'Ajouter une vue',
                    addMenu: "Autres façons d'ajouter",
                    empty: 'Aucune table',
                    emptyHint: 'Créez une table pour commencer',
                    noMatch: 'Aucune table ne correspond à votre filtre.',
                    allHidden: 'Toutes les tables sont masquées',
                    showAll: 'Tout afficher',
                    actions: 'Actions de la table',
                    changeSchema: 'Changer de schéma',
                    addField: 'Ajouter un champ',
                    addIndex: 'Ajouter un index',
                    duplicate: 'Dupliquer la table',
                    delete: 'Supprimer la table',
                    renameTable: 'Renommer la table',
                    toggle: 'Afficher ou masquer les détails',
                    doubleClickToEdit: 'Double-cliquez pour modifier',
                    viewTag: 'Vue',
                    fields: 'Champs',
                    indexes: 'Index',
                    checks: 'Contraintes de vérification',
                    description: 'Description',
                    noDescription: 'Aucune description',
                    duplicateName:
                        "Une autre table de ce schéma s'appelle déjà « {{name}} ».",
                    selectSchema: {
                        title: 'Sélectionner un schéma',
                        text: 'Plusieurs schémas sont affichés. Choisissez-en un pour la nouvelle table.',
                        schema: 'Schéma',
                    },
                    changeSchemaDialog: {
                        title: 'Changer de schéma',
                        text: 'Mettez à jour le schéma de la table « {{name}} ».',
                        createNew: 'Créer un nouveau schéma',
                        newPlaceholder:
                            'Nom du nouveau schéma, par exemple public',
                        change: 'Changer',
                    },
                },
                fields: {
                    add: 'Ajouter un champ',
                    linksRemoved:
                        'Relations supprimées avec le champ : {{count}}. Annuler les rétablit.',
                    name: 'Nom du champ',
                    namePlaceholder: 'Nom du champ',
                    typePlaceholder: 'Type',
                    typeSearch: 'Rechercher un type',
                    typeSearchPlaceholder: 'Rechercher...',
                    noTypes: 'Aucun type trouvé',
                    standardTypes: 'Types standard',
                    customTypes: 'Types personnalisés',
                    nullable: 'Autoriser NULL',
                    nullableShort: 'N',
                    primaryKey: 'Clé primaire',
                    attributes: 'Attributs du champ',
                    unique: 'Unique',
                    autoIncrement: 'Auto-incrément',
                    array: 'Tableau',
                    maxLength: 'Longueur maximale',
                    lengthNone: 'Aucune',
                    lengthMax: 'Max.',
                    lengthCustom: 'Personnalisée',
                    precision: 'Précision',
                    scale: 'Échelle',
                    default: 'Valeur par défaut',
                    noDefault: 'Aucune valeur par défaut',
                    description: 'Description',
                    noDescription: 'Aucune description',
                    delete: 'Supprimer le champ',
                    addNote: 'Ajouter une note',
                    showComment: 'Afficher la description du champ',
                    none: "Cette table n'a aucun champ",
                },
                indexes: {
                    add: 'Ajouter un index',
                    none: 'Aucun index',
                    selectFields: 'Sélectionner des champs',
                    noFields: 'Aucun champ trouvé',
                    unique: 'Unique',
                    attributes: "Attributs de l'index",
                    name: 'Nom',
                    type: "Type d'index",
                    description: 'Description',
                    noDescription: 'Aucune description',
                    delete: "Supprimer l'index",
                    primaryKey: 'Clé primaire',
                    problem: {
                        arrayOrJson:
                            'Nécessite des champs de type array, json, jsonb, tsvector ou hstore',
                        oneField: 'Fonctionne sur un seul champ',
                        notUnique: 'Ne peut pas être unique',
                        needsText:
                            'Nécessite des champs texte (char, varchar, text)',
                        needsGeometry: 'Nécessite un champ géométrique',
                        needsXml: 'Nécessite un champ xml',
                        oneClustered: 'Une table n’a qu’un seul index cluster',
                        oneColumnstore:
                            'Une table n’a qu’un seul index columnstore',
                        needsPrimaryKey: 'Nécessite une clé primaire',
                    },
                },
                checks: {
                    add: 'Ajouter une vérification',
                    none: 'Aucune contrainte de vérification',
                    expression: 'Expression',
                    expressionPlaceholder: 'p. ex. price > 0',
                    attributes: 'Contrainte de vérification',
                    delete: 'Supprimer la contrainte de vérification',
                },
                refs: {
                    filter: 'Filtrer',
                    add: 'Ajouter une relation',
                    collapseAll: 'Tout réduire',
                    relationships: 'Relations',
                    dependencies: 'Dépendances',
                    dependencyTable: 'Table',
                    dependentView: 'Vue dépendante',
                    empty: 'Aucune relation',
                    emptyHint: 'Créez une relation pour commencer',
                    noMatch: 'Aucune relation ne correspond à votre filtre.',
                    primaryTable: 'Table primaire',
                    primaryField: 'Champ primaire',
                    referencedTable: 'Table référencée',
                    referencedField: 'Champ référencé',
                    relatedTable: 'Table liée',
                    relatedField: 'Champ lié',
                    cardinality: 'Cardinalité',
                    oneToOne: 'Un à un',
                    oneToMany: 'Un à plusieurs',
                    manyToOne: 'Plusieurs à un',
                    switchTables: 'Inverser les tables',
                    delete: 'Supprimer',
                    dialog: {
                        title: 'Créer une relation',
                        selectTable: 'Sélectionner une table',
                        selectField: 'Sélectionner un champ',
                        noTables: 'Aucune table trouvée',
                        noFields: 'Aucun champ trouvé',
                        create: 'Créer',
                    },
                    toast: {
                        incompatibleTitle:
                            'Les types de champs ne sont pas compatibles',
                        incompatibleText:
                            "Les relations ne peuvent être créées qu'entre des types de champs compatibles",
                        existsTitle: 'Déjà reliés',
                        existsText:
                            'Ces deux champs ont déjà une relation entre eux',
                        failedTitle: 'Impossible de créer la relation',
                        failedText:
                            'Choisissez deux champs de deux tables différentes.',
                    },
                },
                userTypes: {
                    add: 'Nouveau type',
                    empty: 'Aucun type personnalisé',
                    emptyHint:
                        "Les types personnalisés apparaîtront ici lorsqu'ils seront disponibles dans votre base de données",
                    noMatch:
                        'Aucun type personnalisé ne correspond à votre filtre.',
                    actions: 'Actions',
                    highlight: 'Surligner les champs',
                    clearHighlight: 'Effacer le surlignage',
                    delete: 'Supprimer',
                    rename: 'Renommer le type',
                    kind: 'Nature',
                    enumValues: "Valeurs de l'énumération",
                    enum: 'Enum',
                    composite: 'Composite',
                    valuePlaceholder: "Ajouter une valeur d'enum...",
                    addValue: 'Ajouter une valeur',
                    removeValue: 'Retirer {{value}}',
                    noValues: "Aucune valeur d'enum définie",
                    memberName: 'Nom du champ',
                    memberType: 'Sélectionner un type',
                    addMember: 'Ajouter un champ',
                    removeMember: 'Retirer le champ',
                    noMembers: 'Aucun champ défini',
                },
                visuals: {
                    areas: 'Zones',
                    notes: 'Notes',
                    areaFilter: 'Filtrer',
                    addArea: 'Ajouter une zone',
                    noAreas: 'Aucune zone',
                    noAreasHint: 'Créez une zone pour commencer',
                    noAreasMatch: 'Aucune zone ne correspond à votre filtre.',
                    areaActions: 'Actions de la zone',
                    editName: 'Modifier le nom',
                    deleteArea: 'Supprimer la zone',
                    addNote: 'Ajouter une note',
                    attachedTo: 'Attachée à {{name}}',
                    selectOwner: 'Sélectionnez d’abord une table ou une zone',
                    noNotes: 'Aucune note',
                    noNotesHint:
                        'Sélectionnez une table ou une zone, puis ajoutez une note qui y sera attachée',
                    noNotesMatch: 'Aucune note trouvée',
                    emptyNote: 'Note vide',
                    noteActions: 'Actions de la note',
                    deleteNote: 'Supprimer la note',
                },
                filters: {
                    title: 'Filtrer les tables',
                    search: 'Rechercher des tables...',
                    groupBySchema: 'Grouper par schéma',
                    groupByArea: 'Grouper par zone',
                    show: 'Afficher',
                    hide: 'Masquer',
                    zoomTo: 'Zoomer sur {{name}}',
                    noTables: 'Aucune table trouvée',
                    tryAdjusting:
                        'Essayez de modifier votre recherche ou votre filtre',
                    createToStart: 'Créez une table pour commencer',
                    noSchema: 'Aucun schéma',
                    noArea: 'Aucune zone',
                },
                dbml: {
                    title: 'DBML',
                    empty: "Rien à afficher pour l'instant",
                    copy: 'Copier',
                    standardRefs: 'Afficher les refs standard',
                    inlineRefs: 'Afficher les refs en ligne',
                    copied: 'Copié',
                    edit: 'Modifier',
                    view: 'Afficher',
                    accept: 'Accepter les modifications',
                    undo: 'Annuler les modifications',
                    editor: 'Texte DBML',
                    parseError:
                        "Échec de l'analyse du DBML. Veuillez vérifier la syntaxe. (1 erreur trouvée – ligne {{line}})",
                    parseErrorNoLine:
                        "Échec de l'analyse du DBML. Veuillez vérifier la syntaxe. (1 erreur trouvée)",
                    summary:
                        'Tables : {{added}} nouvelles, {{removed}} supprimées, {{changed}} modifiées ; relations : {{linksAdded}} nouvelles, {{linksRemoved}} supprimées',
                    rejected: "La modification n'a pas pu être appliquée",
                    applying: 'Application des modifications...',
                    leftOut: "Omis de l'export",
                    errorText:
                        '// Erreur lors de la génération du DBML : {{message}}',
                    errorToast: "Erreur d'export DBML",
                },
            },
        },
        canvas: {
            a11y: {
                moved: '{{name}} déplacé',
                selected: '{{name}} sélectionné',
                nodeHint:
                    'Appuyez sur Entrée pour modifier. Les flèches le déplacent, Maj avec les flèches le déplace plus loin. Maj+F10 ouvre le menu.',
                edgeHint:
                    'Appuyez sur Entrée pour sélectionner la relation, Suppr pour la supprimer, Échap pour annuler.',
            },
            surface: {
                label: 'Canevas du diagramme',
                loading: 'Chargement du diagramme...',
            },
            snap: {
                label: 'Aligner sur la grille (maintenez {{key}})',
            },
            overlap: {
                label: 'Mettre en évidence les tables qui se chevauchent',
            },
            highlight: {
                label: '« {{name}} » est mis en évidence – cliquez pour annuler',
            },
            legend: {
                label: 'Couleurs des types',
                text: 'Texte / autre',
                number: 'Nombre',
                moment: 'Date et heure',
                identifier: 'Identifiant',
                flag: 'Booléen',
                document: 'JSON / XML',
            },
            toolbar: {
                label: 'Outils du canevas',
                filter: 'Filtrer les tables ({{shortcut}})',
                showAll: 'Tout afficher ({{shortcut}})',
                zoomOut: 'Zoom arrière',
                zoomIn: 'Zoom avant',
                zoomReset: 'Rétablir le zoom à 100 %',
                arrange: 'Organiser le diagramme automatiquement',
                undo: 'Annuler ({{shortcut}})',
                redo: 'Rétablir ({{shortcut}})',
            },
            showAllPill: 'Tout afficher',
            hiddenAll: {
                title: 'Toutes les tables sont masquées',
                action: 'Tout afficher',
            },
            diff: {
                added: 'Nouvelle table',
                removed: 'Table supprimée',
                changed: 'Table modifiée',
            },
            entity: {
                view: 'vue',
                materializedView: 'vue matérialisée',
                fieldCount_other: '{{count}} champs',
                fieldCount_many: '{{count}} champs',
                fieldCount_one: '{{count}} champ',
                focus: 'Centrer sur le canevas',
                showMore: 'Afficher plus',
                showLess: 'Afficher moins',
                edit: 'Modifier la table',
                unique: 'UQ',
                nullable: 'Peut être vide',
                required: 'Obligatoire',
                primaryKey: 'Clé primaire',
                foreignKey: 'Clé étrangère',
            },
            fieldCard: {
                type: 'Type',
                key: 'Clé',
                nullable: 'NULL autorisé',
                notNull: 'Non NULL',
                unique: 'Unique',
                primaryKey: 'Clé primaire',
                default: 'Défaut',
                references: 'référence {{table}}.{{field}}',
                referencedBy: 'référencé par {{table}}.{{field}}',
            },
            link: {
                label: 'Relation {{name}}',
                select: 'Relation sélectionnée',
                popover: {
                    oneToOne: '1:1',
                    oneToMany: '1:N',
                    switch: 'Inverser les tables',
                    openInPanel: 'Ouvrir dans le panneau latéral',
                    remove: 'Supprimer la relation',
                },
                incompatible: {
                    title: 'Les types de champs ne sont pas compatibles',
                    text: "Les relations ne peuvent être créées qu'entre des types de champs compatibles",
                },
                exists: {
                    title: 'Déjà reliés',
                    text: 'Ces deux champs ont déjà une relation entre eux',
                },
            },
            region: {
                rename: 'Nom de la zone',
            },
            memo: {
                placeholder: 'Note vide',
                edit: 'Texte de la note',
                editNote: 'Modifier la note',
            },
            menu: {
                newTable: 'Nouvelle table',
                newView: 'Nouvelle vue',
                newRelationship: 'Nouvelle relation',
                newArea: 'Nouvelle zone',
                addNote: 'Ajouter une note',
                arrange: 'Organiser le diagramme automatiquement',
                moveToArea: 'Déplacer vers une zone',
                moveToAreaCount: 'Déplacer vers une zone ({{count}})',
                noArea: 'Aucune zone',
                editTable: 'Modifier la table',
                duplicateTable: 'Dupliquer la table',
                addRelationship: 'Ajouter une relation',
                deleteTable: 'Supprimer la table',
                deleteTables: 'Supprimer les tables ({{count}})',
                editAreaName: 'Modifier le nom de la zone',
                arrangeArea: 'Organiser automatiquement',
                deleteArea: 'Supprimer la zone',
            },
            arrange: {
                title: 'Organiser le diagramme automatiquement',
                text: 'Cette action réorganisera toutes les tables du diagramme. Voulez-vous continuer ?',
                confirm: 'Organiser automatiquement',
                cancel: 'Annuler',
            },
            clipboard: {
                copiedOne: 'Table copiée',
                copiedMany: '{{count}} tables copiées',
                hint: 'Appuyez sur {{key}} pour la coller.',
                pastedOne: 'Table collée',
                pastedMany: '{{count}} tables collées',
            },
            drawing: {
                hint: 'Cliquez sur la table qui contient la clé étrangère',
            },
        },
        qubdi: frQubdi,
    },
};
