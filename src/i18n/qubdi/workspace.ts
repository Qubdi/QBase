// English text for the workspace screens: opening diagrams, the projects list,
// publishing, sharing, access and the public share viewer. Other languages fall
// back to these until they are translated.
export const workspace = {
    lockedReason: {
        takenSelf:
            'This diagram is open for editing in another tab or window, so it is read-only here.',
        takenOther:
            '{{holder}} is editing this diagram, so it is read-only for you for now.',
        someoneElse: 'Someone else',
        unbound:
            'This diagram is not in a project, so it is read-only. Move it into a project to edit it.',
        lost: 'You no longer have access to this diagram on the server, so it is read-only.',
        viewerProject:
            'You have view-only access to {{project}}. Ask an admin for the Editor role to make changes.',
        viewerThis:
            'You have view-only access to this project. Ask an admin for the Editor role to make changes.',
        error: 'Could not reach the server, so this diagram is read-only for now.',
    },
    publishStatus: {
        notSynced: 'Not synced to server',
        notPublished: 'Not published',
        published: 'Published v{{version}}',
        publishedChanges: 'Published v{{version}}, unpublished changes',
    },
    shareLinks: {
        access: {
            anyone: 'Anyone with the link',
            signed_in: 'Signed-in users only',
            off: 'Switched off',
        },
        status: {
            active: 'Active',
            off: 'Off',
            expired: 'Expired',
            revoked: 'Revoked',
        },
        expiry: {
            revoked: 'Revoked {{when}}',
            never: 'Never expires',
            expired: 'Expired {{when}}',
            expires: 'Expires {{when}}',
        },
    },
    viewer: {
        unnamedTable: 'unnamed',
    },
    lastSaved: 'Saved {{when}}',
    diagramSummary: {
        table_one: '{{count}} table',
        table_other: '{{count}} tables',
        relationship_one: '{{count}} relationship',
        relationship_other: '{{count}} relationships',
    },
    // messages of the editor's own screens that sit outside the Qubdi dialogs
    editorToasts: {
        fieldTypesIncompatibleTitle: 'Field types are not compatible',
        fieldTypesIncompatibleBody:
            'Relationships can only be created between compatible field types',
        alreadyConnectedTitle: 'Already connected',
        alreadyConnectedBody:
            'These two fields already have a relationship between them',
        deleteDiagramFailed: 'Could not delete the diagram',
    },
    accessBanner: {
        getLatest: 'Get latest and edit',
        moveAria: 'Project to move this diagram into',
        choosePlaceholder: 'Choose a project…',
        move: 'Move into project',
        askAdmin: 'Ask an admin to add you to a project.',
        retry: 'Try again',
    },
    diagramAccess: {
        backToProjects: 'Back to projects',
        projectNotFound: 'Project not found',
        projectNotFoundDetail:
            'It does not exist, or you have not been added to it.',
        diagramNotFound: 'Diagram not found',
        diagramNotFoundDetail:
            'It is not in this project, or you do not have access to it.',
        openFailed: 'Could not open this diagram',
    },
    newDiagram: {
        defaultName: 'Untitled diagram',
        title: 'New diagram',
        description:
            'It will be created in {{project}}, and everyone assigned there can open it.',
        nameLabel: 'Diagram name',
        databaseType: 'Database type',
        creating: 'Creating…',
        create: 'Create diagram',
        import: 'Import from database…',
    },
    projectDiagrams: {
        empty: 'No diagrams in this project yet.',
        table: 'Diagrams',
        name: 'Name',
        createdBy: 'Created by',
        created: 'Created',
        lastModified: 'Last modified',
        tables: 'Tables',
        role: {
            owner: 'Admin',
            editor: 'Editor',
            viewer: 'Viewer',
        },
        savedHere: 'Saved in this browser',
        counts: '{{tables}}, {{relationships}}',
        actionsFor: 'Actions for {{title}}',
        open: 'Open',
        getLatestFromServer: 'Get latest from server',
        deleteForEveryone: 'Delete for everyone',
        deleteTitle: 'Delete this diagram?',
        discardTitle: 'Discard your local copy?',
        deleteDescription:
            '"{{title}}" will be deleted for everyone in the project. This cannot be undone.',
        discardDescription:
            'Changes to "{{title}}" that were not saved to the project are lost, and the latest version is downloaded.',
        cancel: 'Cancel',
        getLatest: 'Get latest',
    },
    projectOpen: {
        descriptionEdit:
            'Open a diagram from this project, or create a new one.',
        descriptionView: 'Open a diagram from this project.',
        searchPlaceholder: 'Search diagrams…',
        searchLabel: 'Search diagrams',
        noMatch: 'No diagrams match “{{query}}”.',
        cancel: 'Cancel',
        newDiagram: 'New diagram',
        openDiagram: 'Open diagram',
    },
    publish: {
        published: 'Published v{{version}}',
        failed: 'Publish failed',
        settingFailed: 'Could not change the setting',
        buttonAria: 'Publish. {{status}}',
        button: 'Publish',
        title: 'Publish diagram',
        description: '{{status}}. Viewers only see published versions.',
        note: 'Note (optional)',
        autoPublish: 'Auto-publish on every save',
    },
    autosave: {
        conflict: 'Someone else saved a newer version',
        overwrite: 'Overwrite with mine',
        notSaved: 'Not saved',
        notSavedRetry: 'Not saved. Click to try again',
        unsaved: 'Unsaved changes',
        unsavedRetry: 'Unsaved changes. Click to save now',
        saving: 'Saving…',
        saved: 'Saved to project',
    },
    share: {
        accessAnyone: 'Anyone with the link',
        accessSignedIn: 'Signed-in users',
        accessOff: 'Off',
        copyFailed: 'Copy failed. Select the link and copy it manually.',
        title: 'Share',
        description:
            'Read-only links show the latest published version. Publish to update what viewers see.',
        urlLabel: 'Share URL',
        copied: 'Copied',
        copy: 'Copy link',
        urlHidden:
            "This link's URL cannot be shown again. Regenerate it to get a new one.",
        access: 'Access',
        accessAria: 'Who can open this link',
        expires: 'Expires',
        live: 'Live updates',
        regenerate: 'Regenerate',
        create: 'Create link',
    },
    shareList: {
        loading: 'Loading…',
        empty: 'This diagram has no share links.',
        label: 'Share links',
        live: 'Live',
        made: 'Made',
        madeBy: 'Made by',
        madeByDeleted: 'Made by a deleted user',
        confirmRevoke: 'Yes, revoke',
        keep: 'Keep',
        revoke: 'Revoke',
        revokeWarning:
            'Anyone using this link loses access at once, including people watching it live. This cannot be undone.',
    },
    viewerPage: {
        pageTitle: 'QBase - Shared diagram',
        loading: 'Loading…',
        notPublishedTitle: 'Not published yet',
        notPublishedDetail:
            'The link works, but its owner has not published this diagram yet. Try again later.',
        notFoundTitle: 'Link not available',
        notFoundDetail:
            'This link does not exist, has expired, or was revoked.',
        loginTitle: 'Sign in to view',
        loginDetail: 'The owner restricted this diagram to signed-in users.',
        signIn: 'Sign in',
        error: 'Could not load this diagram.',
        retry: 'Retry',
        status: 'v{{version}} · read-only',
        statusLive: 'v{{version}} · live · read-only',
        search: 'Search tables and fields',
    },
    viewerNode: {
        view: 'view',
        fieldCount_one: '{{count}} field',
        fieldCount_other: '{{count}} fields',
        unique: 'Unique',
        uniqueShort: 'UQ',
        notNull: 'Not null',
        noFields: 'No fields',
    },
    typeLegend: {
        button: 'Type colors',
        text: 'Text / other',
        number: 'Number',
        time: 'Date & time',
        id: 'Identifier',
        bool: 'Boolean',
        json: 'JSON / XML',
    },
};
