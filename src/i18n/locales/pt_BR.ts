export const pt_BR = {
    translation: {
        menu: {
            actions: {
                save: 'Salvar',
            },
        },
        editor: {
            common: {
                cancel: 'Cancelar',
                close: 'Fechar',
                back: 'Voltar',
                continue: 'Continuar',
                loading: 'Carregando',
                app: {
                    title: 'QBase - Diagramas de esquemas de bancos de dados',
                    description:
                        'Diagramas de esquemas de bancos de dados: importe um banco de dados ativo, publique versões, compartilhe links somente leitura, sincronize de novo e detecte divergências.',
                },
                notFound: {
                    title: 'Algo está faltando.',
                    body: 'Não encontramos a página que você procura. Ela pode ter sido movida ou o link pode estar errado.',
                },
                colorPicker: {
                    change: 'Alterar cor',
                    use: 'Usar',
                    useColor: 'Usar {{color}}',
                    remove: 'Remover {{color}}',
                    yourColors: 'Suas cores',
                    pickCustom: 'Escolher uma cor personalizada',
                    hex: 'Cor hexadecimal',
                    hexPlaceholder: '#rrggbb',
                    invalid: 'Digite uma cor hexadecimal, como #8eb7ff.',
                },
            },
            workspace: {
                frame: {
                    canvasPlaceholder: 'A área do diagrama aparece aqui',
                    panelPlaceholder: 'O painel lateral aparece aqui',
                    resizePanel: 'Redimensionar o painel lateral',
                    openPanel: 'Abrir o painel de edição',
                },
                canvas: {
                    editTable: 'Editar a tabela {{name}}',
                    tableName: 'Nome da tabela',
                    done: 'Concluído',
                    schema: 'Esquema',
                    createSchema: 'Criar novo esquema',
                    newSchemaName: 'Nome do novo esquema',
                    openInPanel: 'Abrir no painel lateral',
                    fieldCount_one: '{{count}} campo',
                    fieldCount_other: '{{count}} campos',
                    fieldCount_many: '{{count}} de campos',
                    loading: 'Carregando o diagrama...',
                    link: {
                        title: 'Novo relacionamento',
                        from: 'De {{table}}.{{field}}',
                        target: 'Campo em {{table}}',
                        newField: 'Novo campo',
                        newFieldName: 'Nome do novo campo',
                        create: 'Criar',
                        cancel: 'Cancelar',
                        noKey: 'A primeira tabela não tem uma chave primária para começar.',
                        noField:
                            'Escolha um campo ou dê um nome ao novo campo.',
                        noLink: 'Esses campos não podem ser conectados.',
                    },
                },
                navbar: {
                    home: 'Início do QBase',
                    language: 'Alterar idioma',
                    searchLanguage: 'Buscar idiomas',
                    showTools: 'Mostrar a barra de ferramentas',
                    hideTools: 'Ocultar a barra de ferramentas',
                },
                name: {
                    label: 'Nome do diagrama',
                    confirm: 'Manter este nome',
                    rename: 'Renomear o diagrama',
                    hint: 'Clique duas vezes para renomear',
                },
                banner: {
                    openOnly:
                        'Os diagramas de {{database}} podem ser abertos e visualizados, mas não alterados, nesta versão do editor.',
                },
                menu: {
                    label: 'Menus do editor',
                    diagram: {
                        label: 'Diagrama',
                        import: 'Importar de',
                        importFile: 'Arquivo de diagrama (.json)',
                        importSql: 'Script SQL',
                        importDbml: 'Texto DBML',
                        exportSql: 'Exportar SQL para',
                        saveAs: 'Salvar como',
                        png: 'Imagem PNG',
                        jpeg: 'Imagem JPEG',
                        svg: 'Imagem SVG',
                        json: 'Arquivo de diagrama (.json)',
                        delete: 'Excluir este diagrama',
                    },
                    edit: {
                        label: 'Editar',
                        undo: 'Desfazer',
                        redo: 'Refazer',
                        clear: 'Esvaziar o diagrama',
                    },
                    view: {
                        label: 'Exibir',
                        sidePanel: 'Painel lateral',
                        cardinality: 'Cardinalidade dos relacionamentos',
                        fieldAttributes: 'Atributos dos campos',
                        compactTables: 'Tabelas compactas',
                        minimap: 'Minimapa',
                        views: 'Views do banco de dados',
                        wheel: 'Roda do mouse',
                        wheelPan: 'Move a visualização',
                        wheelZoom: 'Aplica zoom na visualização',
                        theme: 'Tema de cores',
                        themes: {
                            system: 'Igual ao sistema',
                            light: 'Claro',
                            dark: 'Escuro',
                        },
                        themeKey: 'Alternar entre claro e escuro',
                        preferences: 'Preferências',
                    },
                },
                rail: {
                    label: 'Seções do editor',
                    new: 'Novo',
                    browse: 'Abrir',
                    tables: 'Tabelas',
                    dbml: 'DBML',
                    refs: 'Relacionamentos',
                    customTypes: 'Tipos',
                    visuals: 'Extras',
                },
                drawer: {
                    title: 'Conteúdo do diagrama',
                    description: 'Explore e altere as partes deste diagrama',
                    sections: 'Seção',
                    entries: {
                        tables: 'Tabelas',
                        dbml: 'DBML',
                        refs: 'Relacionamentos',
                        customTypes: 'Tipos personalizados',
                        areas: 'Áreas',
                        notes: 'Notas',
                    },
                },
                toasts: {
                    saved: 'Tudo foi salvo',
                    saving: 'Salvando suas últimas alterações',
                },
                shortcuts: {
                    undo: 'Desfazer',
                    redo: 'Refazer',
                    openDiagram: 'Abrir um diagrama',
                    save: 'Confirmar que as alterações foram salvas',
                    togglePanel: 'Mostrar ou ocultar o painel lateral',
                    fitAll: 'Ajustar todas as tabelas à visualização',
                    toggleTheme: 'Alternar entre claro e escuro',
                    toggleFilter: 'Mostrar ou ocultar o filtro de tabelas',
                    copyTables: 'Copiar as tabelas selecionadas',
                    pasteTables: 'Colar as tabelas copiadas',
                    removeSelection: 'Excluir a seleção',
                },
            },
            designs: {
                defaultName: 'Diagrama {{number}}',
                create: {
                    titleType: 'Para qual banco de dados é?',
                    descriptionType:
                        'A escolha fica com o diagrama. Escolha um para continuar.',
                    titleImport: 'Comece de um trabalho existente',
                    descriptionImport:
                        'Cole um esquema para criar o diagrama a partir dele ou comece com um em branco.',
                    fromFile: 'Abrir um arquivo salvo',
                    empty: 'Diagrama em branco',
                    emptyFromImport: 'Prefiro um diagrama em branco',
                    import: 'Criar a partir de texto',
                    failed: 'Não foi possível criar o diagrama. Tente novamente.',
                },
                open: {
                    title: 'Seus diagramas',
                    description:
                        'Tudo o que está salvo neste navegador, do alterado mais recentemente ao mais antigo.',
                    search: 'Buscar por nome',
                    empty: 'Ainda não há diagramas salvos aqui.',
                    noMatch: 'Nenhum diagrama tem esse nome.',
                    columns: {
                        name: 'Nome',
                        created: 'Criado',
                        changed: 'Alterado',
                        tables: 'Tabelas',
                        actions: 'Ações',
                    },
                    actionsFor: 'Ações para {{name}}',
                    rowOpen: 'Abrir',
                    rowRename: 'Renomear',
                    rowDuplicate: 'Fazer uma cópia',
                    rowDelete: 'Excluir',
                    newDatabase: 'Novo diagrama',
                    open: 'Abrir diagrama',
                    copySuffix: '(Cópia)',
                    duplicated: '{{name}} foi criado',
                },
                rename: {
                    title: 'Renomear diagrama',
                    description:
                        'Escolha um novo nome. Deixe em branco para manter o atual.',
                    label: 'Nome do diagrama',
                    save: 'Renomear',
                },
                delete: {
                    title: 'Excluir este diagrama?',
                    description:
                        '"{{name}}" será removido definitivamente. Isso não pode ser desfeito.',
                    confirm: 'Excluir',
                    failed: 'Não foi possível excluir o diagrama',
                },
                clear: {
                    title: 'Esvaziar o diagrama?',
                    description:
                        'Todas as tabelas, relacionamentos e notas serão removidos e o histórico será perdido. O diagrama em si permanece. Isso não pode ser desfeito.',
                    confirm: 'Esvaziar',
                    failed: 'Não foi possível esvaziar o diagrama',
                },
            },
            diagnostics: {
                withLine: 'Linha {{line}}: {{text}}',
                found_one: '{{count}} tabela encontrada',
                found_other: '{{count}} tabelas encontradas',
                found_many: '{{count}} de tabelas encontradas',
                foundViews_one: '{{count}} view',
                foundViews_other: '{{count}} views',
                foundViews_many: '{{count}} de views',
                foundWithViews: '{{tables}} e {{views}} para importar.',
                foundOnly: '{{tables}} para importar.',
                nothingToImport: 'Nada para importar',
                nothingToExport: 'Nada para exportar',
                emptyScript: 'O script SQL está vazio',
                noStatements: 'Nenhuma instrução SQL válida encontrada',
                addCreateTable:
                    'Adicione instruções CREATE TABLE para importar',
                noSemicolon:
                    'As instruções SQL devem terminar com ponto e vírgula (;)',
                unterminatedComment: 'Comentário de bloco não encerrado',
                closeComment: 'Feche o comentário com */',
                unterminatedText: 'Texto entre aspas não encerrado',
                closeText: 'Feche o texto com {{quote}}',
                unmatchedParen: 'Parêntese de fechamento sem par',
                unclosedParen: 'Parêntese não fechado',
                dialectSyntax: {
                    serialMysql:
                        'SERIAL não é válido no MySQL, use AUTO_INCREMENT',
                    identityMysql:
                        'GENERATED ... AS IDENTITY não é válido no MySQL, use AUTO_INCREMENT',
                    sqlServerIdentityMysql:
                        'IDENTITY(a,b) é sintaxe do SQL Server, use AUTO_INCREMENT',
                    autoIncrementSqlServer:
                        'AUTO_INCREMENT é sintaxe do MySQL, use IDENTITY(1,1)',
                    serialSqlServer:
                        'SERIAL é sintaxe do PostgreSQL, use IDENTITY(1,1)',
                    identitySqlServer:
                        'GENERATED ... AS IDENTITY não é válido no SQL Server, use IDENTITY(1,1)',
                    ifNotExistsSqlServer:
                        'CREATE TABLE IF NOT EXISTS não é válido em T-SQL',
                    schemaSqlite: 'CREATE SCHEMA não é compatível com o SQLite',
                    removeSchemaSqlite:
                        'Remova as instruções de criação de esquema para o SQLite',
                    enumSqlite:
                        'ENUM não é compatível com o SQLite, use uma restrição CHECK',
                    autoIncrementSqlite:
                        'AUTO_INCREMENT é sintaxe do MySQL, use AUTOINCREMENT',
                    serialSqlite:
                        'SERIAL é sintaxe do PostgreSQL, use INTEGER PRIMARY KEY AUTOINCREMENT',
                    identitySqlite:
                        'GENERATED ... AS IDENTITY não é válido no SQLite, use AUTOINCREMENT',
                    sqlServerIdentitySqlite:
                        'IDENTITY(a,b) é sintaxe do SQL Server, use AUTOINCREMENT',
                    inlineReferencesMysql:
                        'O MySQL não aceita REFERENCES em linha nas definições de coluna (linha {{line}}). Use restrições FOREIGN KEY:',
                },
                postgres: {
                    brokenCast:
                        'Operador de conversão inválido ": :" encontrado. O PostgreSQL usa "::" para converter tipos.',
                    fixCast: 'Substitua ": :" por "::"',
                    splitDecimal:
                        'O tipo DECIMAL está dividido em várias linhas. Isso pode causar erros de análise.',
                    fixDecimal:
                        'Coloque a precisão e a escala em uma única linha',
                    extension:
                        'Instruções CREATE EXTENSION encontradas. Elas serão ignoradas na importação.',
                    functions:
                        'Definições de funções encontradas. Elas serão ignoradas na importação.',
                    triggers:
                        'Definições de triggers encontradas. Elas não serão importadas.',
                    large: 'Arquivo SQL grande detectado ({{count}} instruções). A importação pode demorar um pouco.',
                    postgis:
                        'Tipos geográficos do PostGIS detectados. Eles serão importados, mas talvez não exibam dados geométricos.',
                },
                import: {
                    viewNoColumns:
                        'A view {{name}} não tem colunas que possam ser lidas a partir da definição.',
                    skipped_one:
                        '{{count}} instrução {{kind}} ignorada: não importada.',
                    skipped_other:
                        '{{count}} instruções {{kind}} ignoradas: não importadas.',
                    skipped_many:
                        '{{count}} de instruções {{kind}} ignoradas: não importadas.',
                    linkTableMissing:
                        'Chave estrangeira de {{table}} descartada: a tabela {{ref}} não está no script.',
                    linkColumnsMismatch:
                        'Chave estrangeira de {{table}} descartada: as colunas não correspondem.',
                    linkNamedMissing:
                        'Chave estrangeira {{name}} descartada: falta uma tabela ou coluna.',
                    rowsDropped_one:
                        '{{count}} linha de chave estrangeira descartada: uma tabela ou coluna não está na importação.',
                    rowsDropped_other:
                        '{{count}} linhas de chave estrangeira descartadas: uma tabela ou coluna não está na importação.',
                    rowsDropped_many:
                        '{{count}} de linhas de chave estrangeira descartadas: uma tabela ou coluna não está na importação.',
                    unsupportedType: 'Tipo de banco de dados não compatível',
                    invalidDbml: 'DBML inválido',
                    invalidRelationship:
                        'Relacionamento inválido: tabelas ou campos não encontrados',
                    manyToMany:
                        'Referências de muitos para muitos (<>) não são compatíveis: "{{left}}" e "{{right}}". Adicione uma tabela de junção que referencie as duas.',
                    missingIndexColumn:
                        'O índice faz referência a uma coluna que não existe: {{name}}',
                    invalidCheck:
                        'Restrição check inválida em {{name}}: {{problem}}',
                    arrayType:
                        'Tipos de array não são compatíveis com bancos de dados {{dialect}}. O campo "{{field}}" tem o tipo de array "{{type}}", que não é permitido.',
                },
                export: {
                    lostFields_one:
                        'A tabela {{name}} perdeu {{count}} campo sem nome.',
                    lostFields_other:
                        'A tabela {{name}} perdeu {{count}} campos sem nome.',
                    lostFields_many:
                        'A tabela {{name}} perdeu {{count}} de campos sem nome.',
                    leftOutDuplicate:
                        'A tabela {{name}} foi deixada de fora: outra tabela tem o mesmo nome.',
                    leftOutEmpty:
                        'A tabela {{name}} foi deixada de fora: não tem campos.',
                    notSupportedFor:
                        'A exportação de SQL não é compatível com {{label}}',
                    notSupportedForDiagrams:
                        'A exportação de SQL não é compatível com diagramas de {{label}}',
                    conversion: 'A conversão para {{label}} não é compatível',
                },
                check: {
                    empty: 'A expressão está vazia',
                    subQuery:
                        'Subconsultas não são permitidas em uma restrição check',
                    keyword:
                        'A palavra-chave {{word}} não é permitida em uma restrição check',
                    extraParen: 'Parênteses desbalanceados: sobrou )',
                    openParen: 'Parênteses desbalanceados: ( não está fechado',
                    statements:
                        'Instruções não são permitidas em uma restrição check',
                    comments:
                        'Comentários não são permitidos em uma restrição check',
                },
                refusal: {
                    readOnly: 'Este diagrama não pode ser editado',
                    nothingToUndo: 'Nada para desfazer',
                    nothingToRedo: 'Nada para refazer',
                },
            },
            importing: {
                file: {
                    title: 'Abrir um diagrama salvo',
                    description:
                        'Escolha um arquivo .json salvo pelo QBase. Ele é adicionado como um novo diagrama.',
                    drop: 'Solte um arquivo aqui ou clique para escolher um',
                    action: 'Importar',
                    invalid:
                        'Esse arquivo não é um diagrama salvo pelo QBase, então nada foi importado.',
                    failed: 'Não foi possível importar o arquivo. Tente novamente.',
                },
                box: {
                    method: {
                        metadata: 'Consulta ao banco de dados',
                        sql: 'Script SQL',
                        dbml: 'DBML',
                    },
                    field: {
                        metadata: 'Resultado da consulta',
                        sql: 'Script SQL',
                        dbml: 'Texto DBML',
                    },
                    placeholder: {
                        metadata: 'Cole aqui o resultado da consulta',
                        sql: 'Cole aqui as instruções CREATE TABLE',
                        dbml: 'Cole aqui o DBML',
                    },
                    edition: 'Edição',
                    editionStandard: 'Padrão',
                    editions: {
                        supabase: 'Supabase',
                        timescale: 'Timescale',
                        mysql_5_7: 'MySQL 5.7',
                        sql_server_2016_and_below:
                            'SQL Server 2016 e anteriores',
                        cloudflare_d1: 'Cloudflare D1',
                    },
                    scriptIntro:
                        'Execute a consulta no seu próprio cliente de banco de dados e cole abaixo a única célula do resultado.',
                    copyScript: 'Copiar a consulta',
                    noScript:
                        'Ainda não há uma consulta pronta para este banco de dados.',
                    scriptCopied: 'Consulta copiada',
                    copyFailed: 'Copiar não está disponível neste navegador',
                    truncated:
                        'O texto colado tem exatamente 65.535 caracteres, o que normalmente significa que seu cliente o cortou. Exporte a célula para um arquivo em vez de copiá-la da grade.',
                    repair: 'Reparar o texto',
                    repairing: 'Reparando o texto...',
                    repaired: 'O texto foi reparado.',
                    moreProblems_one: 'Mais {{count}} problema',
                    moreProblems_other: 'Mais {{count}} problemas',
                    moreProblems_many: 'Mais {{count}} de problemas',
                    found: '{{tables}} e {{links}} encontrados.',
                    foundTables_one: '{{count}} tabela',
                    foundTables_other: '{{count}} tabelas',
                    foundTables_many: '{{count}} de tabelas',
                    foundLinks_one: '{{count}} relacionamento',
                    foundLinks_other: '{{count}} relacionamentos',
                    foundLinks_many: '{{count}} de relacionamentos',
                    nothing: 'Não há nada para importar neste texto.',
                },
                picker: {
                    title: 'Escolha o que trazer',
                    summary:
                        '{{selected}} de {{total}} escolhidos (no máximo {{limit}})',
                    search: 'Buscar por nome',
                    kind: 'Tipo',
                    kindAll: 'Tabelas e views',
                    kindTables: 'Somente tabelas',
                    kindViews: 'Somente views',
                    schema: 'Esquema',
                    schemaAll: 'Todos os esquemas',
                    selectPage: 'Escolher tudo nesta página',
                    viewTag: 'view',
                    previous: 'Anterior',
                    next: 'Próxima',
                    page: 'Página {{page}} de {{pages}}',
                },
                into: {
                    title: 'Adicionar a este diagrama',
                    description:
                        'As novas tabelas são colocadas à direita do que já existe. O histórico é limpo depois.',
                    newTables_one: '{{count}} tabela será adicionada.',
                    newTables_other: '{{count}} tabelas serão adicionadas.',
                    newTables_many: '{{count}} de tabelas serão adicionadas.',
                    newLinks_one: '{{count}} relacionamento será adicionado.',
                    newLinks_other:
                        '{{count}} relacionamentos serão adicionados.',
                    newLinks_many:
                        '{{count}} de relacionamentos serão adicionados.',
                    newTypes_one:
                        '{{count}} tipo personalizado será adicionado.',
                    newTypes_other:
                        '{{count}} tipos personalizados serão adicionados.',
                    newTypes_many:
                        '{{count}} de tipos personalizados serão adicionados.',
                    duplicates:
                        'Estas tabelas já existem e aparecerão duas vezes: {{names}}',
                    apply: 'Adicionar ao diagrama',
                    done_one: '{{count}} tabela adicionada',
                    done_other: '{{count}} tabelas adicionadas',
                    done_many: '{{count}} de tabelas adicionadas',
                    failed: 'Nada foi importado',
                },
            },
            exporting: {
                sql: {
                    title: 'SQL para {{database}}',
                    description:
                        'O script inclui as tabelas que estão sendo exibidas no momento.',
                    script: 'Script gerado',
                    copy: 'Copiar',
                    copied: 'Script copiado',
                    copyFailed: 'Copiar não está disponível neste navegador',
                    download: 'Baixar .sql',
                    nothing: 'Ainda não há tabelas para exportar.',
                },
                json: {
                    title: 'Salvar como arquivo de diagrama',
                    description:
                        'O arquivo guarda o diagrama inteiro e pode ser aberto de novo na tela de novo diagrama.',
                    summary: '{{name}} (cerca de {{size}} KB)',
                    download: 'Baixar',
                },
                image: {
                    title: 'Salvar como {{format}}',
                    description:
                        'A imagem mostra o diagrama inteiro, com as cores que você está usando agora.',
                    scale: 'Tamanho',
                    pattern: 'Desenhar o fundo pontilhado',
                    transparent: 'Fundo transparente',
                    jpegNote:
                        'O JPEG não aceita transparência, então a cor da página é usada.',
                    action: 'Salvar imagem',
                    working: 'Criando a imagem',
                    empty: 'Ainda não há nada para colocar na imagem',
                    failed: 'Não foi possível criar a imagem',
                    lowered:
                        'A imagem é muito grande, por isso foi criada em {{scale}}x para caber no limite do navegador',
                },
            },
            settings: {
                title: 'Preferências',
                description:
                    'Estas escolhas pertencem a este navegador, não ao diagrama.',
                theme: 'Tema de cores',
                themes: {
                    system: 'Igual ao sistema',
                    light: 'Claro',
                    dark: 'Escuro',
                },
                language: 'Idioma',
                wheel: 'Roda do mouse',
                wheelModes: {
                    pan: 'Move a visualização',
                    zoom: 'Aplica zoom na visualização',
                },
                cardinality: 'Mostrar a cardinalidade dos relacionamentos',
                fieldAttributes: 'Mostrar os atributos dos campos',
                compactTables: 'Usar tabelas compactas',
                minimap: 'Mostrar o minimapa',
                outlineOverlaps: 'Destacar o contorno de tabelas sobrepostas',
                views: 'Mostrar as views do banco de dados',
                shortcuts: 'Atalhos de teclado',
            },
            sidePanel: {
                common: {
                    filter: 'Filtrar',
                    clearFilter: 'Limpar filtro',
                    focus: 'Focar no canvas',
                    more: 'Mais ações',
                    rename: 'Renomear',
                    saveName: 'Salvar nome',
                    dragHandle: 'Arraste para reordenar',
                    cancel: 'Cancelar',
                    confirm: 'Confirmar',
                    close: 'Fechar',
                },
                tables: {
                    add: 'Adicionar tabela',
                    addView: 'Adicionar view',
                    addMenu: 'Mais formas de adicionar',
                    empty: 'Nenhuma tabela',
                    emptyHint: 'Crie uma tabela para começar',
                    noMatch: 'Nenhuma tabela encontrada com o seu filtro.',
                    allHidden: 'Todas as tabelas estão ocultas',
                    showAll: 'Mostrar todas',
                    actions: 'Ações da tabela',
                    changeSchema: 'Alterar esquema',
                    addField: 'Adicionar campo',
                    addIndex: 'Adicionar índice',
                    duplicate: 'Duplicar tabela',
                    delete: 'Excluir tabela',
                    renameTable: 'Renomear tabela',
                    toggle: 'Mostrar ou ocultar os detalhes',
                    doubleClickToEdit: 'Clique duas vezes para editar',
                    viewTag: 'View',
                    fields: 'Campos',
                    indexes: 'Índices',
                    checks: 'Restrições check',
                    description: 'Descrição',
                    noDescription: 'Sem descrição',
                    color: 'Cor da tabela',
                    duplicateName:
                        'Já existe outra tabela neste esquema com o nome "{{name}}".',
                    selectSchema: {
                        title: 'Selecionar esquema',
                        text: 'Vários esquemas estão sendo exibidos. Escolha um para a nova tabela.',
                        schema: 'Esquema',
                    },
                    changeSchemaDialog: {
                        title: 'Alterar esquema',
                        text: 'Atualize o esquema da tabela "{{name}}".',
                        createNew: 'Criar novo esquema',
                        newPlaceholder:
                            'Nome do novo esquema, por exemplo public',
                        change: 'Alterar',
                    },
                },
                fields: {
                    add: 'Adicionar campo',
                    linksRemoved:
                        'Relacionamentos removidos junto com o campo: {{count}}. Desfazer os traz de volta.',
                    name: 'Nome do campo',
                    namePlaceholder: 'Nome do campo',
                    typePlaceholder: 'Tipo',
                    typeSearch: 'Buscar tipos',
                    noTypes: 'Nenhum tipo encontrado',
                    standardTypes: 'Tipos padrão',
                    customTypes: 'Tipos personalizados',
                    nullable: 'Permitir nulo',
                    nullableShort: 'N',
                    primaryKey: 'Chave primária',
                    attributes: 'Atributos do campo',
                    unique: 'Único',
                    autoIncrement: 'Autoincremento',
                    array: 'Array',
                    maxLength: 'Comprimento máximo',
                    lengthNone: 'Nenhum',
                    lengthMax: 'Máx.',
                    lengthCustom: 'Personalizado',
                    precision: 'Precisão',
                    scale: 'Escala',
                    default: 'Valor padrão',
                    noDefault: 'Sem valor padrão',
                    description: 'Descrição',
                    noDescription: 'Sem descrição',
                    delete: 'Excluir campo',
                    showComment: 'Mostrar a descrição do campo',
                    foreignKey: 'Chave estrangeira',
                    none: 'Esta tabela não tem campos',
                },
                indexes: {
                    add: 'Adicionar índice',
                    none: 'Nenhum índice',
                    selectFields: 'Selecionar campos',
                    noFields: 'Nenhum campo encontrado',
                    unique: 'Único',
                    attributes: 'Atributos do índice',
                    name: 'Nome',
                    type: 'Tipo de índice',
                    description: 'Descrição',
                    noDescription: 'Sem descrição',
                    delete: 'Excluir índice',
                    primaryKey: 'Chave primária',
                    ginNeedsFields:
                        'Requer campos array, json, jsonb, tsvector ou hstore',
                },
                checks: {
                    add: 'Adicionar restrição check',
                    none: 'Nenhuma restrição check',
                    unsupported:
                        'A exportação de SQL para este banco de dados omite as restrições check',
                    expression: 'Expressão',
                    expressionPlaceholder: 'ex.: price > 0',
                    attributes: 'Restrição check',
                    delete: 'Excluir restrição check',
                },
                refs: {
                    filter: 'Filtrar',
                    add: 'Adicionar relacionamento',
                    collapseAll: 'Recolher tudo',
                    relationships: 'Relacionamentos',
                    empty: 'Nenhum relacionamento',
                    emptyHint: 'Crie um relacionamento para começar',
                    noMatch:
                        'Nenhum relacionamento encontrado com o seu filtro.',
                    primaryTable: 'Tabela primária',
                    primaryField: 'Campo primário',
                    referencedTable: 'Tabela referenciada',
                    referencedField: 'Campo referenciado',
                    relatedTable: 'Tabela relacionada',
                    relatedField: 'Campo relacionado',
                    cardinality: 'Cardinalidade',
                    oneToOne: 'Um para um',
                    oneToMany: 'Um para muitos',
                    manyToOne: 'Muitos para um',
                    switchTables: 'Trocar tabelas',
                    delete: 'Excluir',
                    dialog: {
                        title: 'Criar relacionamento',
                        selectTable: 'Selecionar tabela',
                        selectField: 'Selecionar campo',
                        noTables: 'Nenhuma tabela encontrada',
                        noFields: 'Nenhum campo encontrado',
                        create: 'Criar',
                    },
                    toast: {
                        incompatibleTitle:
                            'Os tipos de campo não são compatíveis',
                        incompatibleText:
                            'Só é possível criar relacionamentos entre tipos de campo compatíveis',
                        existsTitle: 'Já conectados',
                        existsText:
                            'Estes dois campos já têm um relacionamento entre eles',
                        failedTitle: 'Não foi possível criar o relacionamento',
                        failedText:
                            'Escolha dois campos de duas tabelas diferentes.',
                    },
                },
                userTypes: {
                    add: 'Novo tipo',
                    empty: 'Nenhum tipo personalizado',
                    emptyHint:
                        'Os tipos personalizados aparecerão aqui quando estiverem disponíveis no seu banco de dados',
                    noMatch:
                        'Nenhum tipo personalizado encontrado com o seu filtro.',
                    actions: 'Ações',
                    delete: 'Excluir',
                    rename: 'Renomear tipo',
                    kind: 'Espécie',
                    enum: 'Enum',
                    composite: 'Composto',
                    valuePlaceholder: 'Adicionar valor de enum...',
                    addValue: 'Adicionar valor',
                    removeValue: 'Remover {{value}}',
                    noValues: 'Nenhum valor de enum definido',
                    memberName: 'Nome do campo',
                    memberType: 'Selecionar tipo',
                    addMember: 'Adicionar campo',
                    removeMember: 'Remover campo',
                    noMembers: 'Nenhum campo definido',
                },
                visuals: {
                    areas: 'Áreas',
                    notes: 'Notas',
                    areaFilter: 'Filtrar',
                    addArea: 'Adicionar área',
                    noAreas: 'Nenhuma área',
                    noAreasHint: 'Crie uma área para começar',
                    noAreasMatch: 'Nenhuma área encontrada com o seu filtro.',
                    areaActions: 'Ações da área',
                    editName: 'Editar nome',
                    deleteArea: 'Excluir área',
                    addNote: 'Adicionar nota',
                    noNotes: 'Nenhuma nota',
                    noNotesHint:
                        'Crie uma nota para adicionar anotações de texto no canvas',
                    noNotesMatch: 'Nenhuma nota encontrada',
                    emptyNote: 'Nota vazia',
                    noteActions: 'Ações da nota',
                    deleteNote: 'Excluir nota',
                    colour: 'Cor',
                },
                filters: {
                    title: 'Filtrar tabelas',
                    search: 'Buscar tabelas...',
                    groupBySchema: 'Agrupar por esquema',
                    groupByArea: 'Agrupar por área',
                    show: 'Mostrar',
                    hide: 'Ocultar',
                    zoomTo: 'Aproximar em {{name}}',
                    noTables: 'Nenhuma tabela encontrada',
                    tryAdjusting: 'Tente ajustar a busca ou o filtro',
                    createToStart: 'Crie uma tabela para começar',
                    noSchema: 'Sem esquema',
                    noArea: 'Sem área',
                    showAllShort: 'Mostrar todas as tabelas',
                },
                hover: {
                    type: 'tipo',
                    nullability: 'nulo',
                    nullable: 'aceita nulo',
                    notNull: 'NOT NULL',
                    key: 'chave',
                    primaryKey: 'chave primária',
                    unique: 'único',
                    autoIncrement: 'autoincremento',
                    default: 'padrão',
                    check: 'check',
                    references: 'referencia',
                    referencedBy: 'referenciado por',
                },
                clipboard: {
                    copied: 'Tabela copiada',
                    copiedMany: '{{count}} tabelas copiadas',
                    pasteHint: 'Pressione {{key}} para colá-la.',
                    pasted: 'Tabela colada',
                    pastedMany: '{{count}} tabelas coladas',
                },
                dbml: {
                    title: 'DBML',
                    empty: 'Ainda não há nada para mostrar',
                    copy: 'Copiar',
                    standardRefs: 'Mostrar refs padrão',
                    inlineRefs: 'Mostrar refs em linha',
                    copied: 'Copiado',
                    failed: 'Não foi possível gerar o DBML',
                    edit: 'Editar',
                    view: 'Exibir',
                    accept: 'Aceitar alterações',
                    undo: 'Desfazer alterações',
                    editor: 'Texto DBML',
                    parseError:
                        'Falha ao analisar o DBML. Verifique a sintaxe. (1 erro encontrado, na linha {{line}})',
                    parseErrorNoLine:
                        'Falha ao analisar o DBML. Verifique a sintaxe. (1 erro encontrado)',
                    summary:
                        'Tabelas: {{added}} novas, {{removed}} removidas, {{changed}} alteradas; relacionamentos: {{linksAdded}} novos, {{linksRemoved}} removidos',
                    rejected: 'Não foi possível aplicar a alteração',
                    applying: 'Aplicando alterações...',
                    leftOut: 'Fora da exportação',
                    errorText: '// Erro ao gerar o DBML: {{message}}',
                    errorToast: 'Erro na exportação do DBML',
                },
            },
        },
        canvas: {
            surface: {
                label: 'Canvas do diagrama',
                loading: 'Carregando o diagrama...',
            },
            snap: {
                label: 'Alinhar à grade (segure {{key}})',
            },
            overlap: {
                label: 'Destacar tabelas sobrepostas',
            },
            highlight: {
                label: 'Destacando "{{name}}": clique para limpar',
            },
            toolbar: {
                label: 'Ferramentas do canvas',
                filter: 'Filtrar tabelas ({{shortcut}})',
                showAll: 'Mostrar todas ({{shortcut}})',
                zoomOut: 'Reduzir',
                zoomIn: 'Ampliar',
                zoomReset: 'Redefinir o zoom para 100%',
                arrange: 'Organizar o diagrama automaticamente',
                undo: 'Desfazer ({{shortcut}})',
                redo: 'Refazer ({{shortcut}})',
                fullScreen: 'Tela cheia',
                exitFullScreen: 'Sair da tela cheia',
            },
            showAllPill: 'Mostrar todas',
            hiddenAll: {
                title: 'Todas as tabelas estão ocultas',
                action: 'Mostrar todas',
            },
            diff: {
                added: 'Tabela nova',
                removed: 'Tabela removida',
                changed: 'Tabela alterada',
            },
            entity: {
                view: 'view',
                materializedView: 'view materializada',
                fieldCount_other: '{{count}} campos',
                fieldCount_many: '{{count}} de campos',
                fieldCount_one: '{{count}} campo',
                openInPanel: 'Abrir no painel lateral',
                widen: 'Alargar',
                narrow: 'Estreitar',
                showMore: 'Mostrar mais',
                showLess: 'Mostrar menos',
                edit: 'Editar tabela',
                unique: 'UQ',
                nullable: 'Pode ficar vazio',
                required: 'Obrigatório',
                primaryKey: 'Chave primária',
                foreignKey: 'Chave estrangeira',
            },
            fieldCard: {
                type: 'Tipo',
                nullable: 'Aceita nulo',
                notNull: 'Não nulo',
                unique: 'Único',
                primaryKey: 'Chave primária',
                default: 'Padrão',
                references: 'referencia {{table}}.{{field}}',
                referencedBy: 'referenciado por {{table}}.{{field}}',
            },
            link: {
                label: 'Relacionamento {{name}}',
                select: 'Relacionamento selecionado',
                popover: {
                    oneToOne: '1:1',
                    oneToMany: '1:N',
                    switch: 'Trocar tabelas',
                    openInPanel: 'Abrir no painel lateral',
                    remove: 'Excluir relacionamento',
                },
                incompatible: {
                    title: 'Os tipos de campo não são compatíveis',
                    text: 'Só é possível criar relacionamentos entre tipos de campo compatíveis',
                },
                exists: {
                    title: 'Já conectados',
                    text: 'Estes dois campos já têm um relacionamento entre eles',
                },
            },
            region: {
                rename: 'Nome da área',
                colour: 'Cor da área',
            },
            memo: {
                placeholder: 'Nota vazia',
                edit: 'Texto da nota',
                colour: 'Cor da nota',
            },
            menu: {
                newTable: 'Nova tabela',
                newView: 'Nova view',
                newRelationship: 'Novo relacionamento',
                newArea: 'Nova área',
                newNote: 'Nova nota',
                arrange: 'Organizar o diagrama automaticamente',
                moveToArea: 'Mover para uma área',
                moveToAreaCount: 'Mover para uma área ({{count}})',
                noArea: 'Sem área',
                editTable: 'Editar tabela',
                duplicateTable: 'Duplicar tabela',
                addRelationship: 'Adicionar relacionamento',
                deleteTable: 'Excluir tabela',
                deleteTables: 'Excluir tabelas ({{count}})',
                editAreaName: 'Editar nome da área',
                arrangeArea: 'Organizar automaticamente',
                deleteArea: 'Excluir área',
            },
            arrange: {
                title: 'Organizar o diagrama automaticamente',
                text: 'Esta ação reorganizará todas as tabelas do diagrama. Deseja continuar?',
                confirm: 'Organizar automaticamente',
                cancel: 'Cancelar',
            },
            clipboard: {
                copiedOne: 'Tabela copiada',
                copiedMany: '{{count}} tabelas copiadas',
                hint: 'Pressione {{key}} para colá-la.',
                pastedOne: 'Tabela colada',
                pastedMany: '{{count}} tabelas coladas',
                failed: 'Falha ao copiar',
            },
            drawing: {
                hint: 'Clique na tabela que contém a chave estrangeira',
            },
            keys: {
                mod: 'Ctrl',
                modMac: '⌘',
            },
        },
    },
};
