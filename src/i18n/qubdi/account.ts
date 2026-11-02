// English text for one area of the Qubdi (server) screens. Other languages
// fall back to these until they are translated.
export const account = {
    // messages for the error codes the server sends (see errorMessage in api.ts)
    errors: {
        invalid_credentials: 'Wrong email or password.',
        email_taken: 'That email is already registered.',
        signup_disabled:
            'Accounts are created by an admin. Ask yours for access.',
        invalid_request: 'Please check the values you entered.',
        wrong_password: 'Current password is incorrect.',
        invalid_code: 'That code is not right. Check the app and try again.',
        invalid_challenge:
            'That sign-in took too long or had too many wrong codes. Enter your password again.',
        mfa_code_required:
            'Enter the code from your authenticator app (or a recovery code).',
        mfa_unavailable:
            'Two-factor sign-in cannot be used on this server right now (its encryption key is missing).',
        already_enabled: 'Two-factor sign-in is already on.',
        not_enabled: 'Two-factor sign-in is not on.',
        setup_first: 'Start the set-up first.',
        cannot_reset_self:
            'Turn your own two-factor sign-in off from the account menu.',
        weak_password: 'That password does not meet the rules below.',
        same_password: 'Choose a password different from the current one.',
        password_change_required:
            'Choose your own password before you continue.',
        user_not_found: 'No account with that email exists yet.',
        already_member: 'That person already has access.',
        forbidden: 'You do not have permission to do that.',
        not_found: 'Not found.',
        encryption_not_configured:
            'This server cannot store passwords (CONNECTION_KEY is not set).',
        name_taken: 'That name is already in use.',
        password_required:
            'Type the password again to change the host, port or type of a saved connection.',
        too_many_attempts:
            'Too many failed attempts. Wait a few minutes and try again.',
        invalid_webhook: 'That webhook URL is not valid.',
        connection_required: 'Choose a saved connection first.',
        connection_not_found: 'That saved connection does not exist.',
        not_configured: 'Save the drift settings first.',
        already_running: 'A check is already running.',
        no_project:
            'Open this diagram from a project before saving it to the server.',
        last_admin: 'There must be at least one admin who can sign in.',
        cannot_disable_self: 'You cannot disable your own account.',
        cannot_sign_out_self:
            'You cannot sign yourself out here. Use Sign out in the account menu.',
        account_disabled:
            'This account has been disabled. Ask an admin to enable it.',
        invalid_name:
            'Use letters or numbers in the project name; it becomes its web address.',
        reserved_name:
            'That name is used by the app itself. Choose another one.',
        cannot_delete_self: 'You cannot delete your own account.',
        project_not_empty:
            'This project still has diagrams. Delete them first.',
        managed_by_project:
            'Access is managed by the project. Ask an admin to change it.',
        // not server codes: fallbacks
        requestFailed: 'Request failed ({{code}}).',
        locked: 'Someone else is editing this diagram.',
        unreachable: 'Could not reach the server.',
    },
    authDialog: {
        twoFactorTitle: 'Two-factor authentication',
        recoveryDescription:
            'Enter one of your recovery codes. Each one works only once.',
        codeDescription:
            'Enter the 6-digit code your authenticator app shows for QBase.',
        verify: 'Verify',
        useAuthenticator: 'Use the authenticator app instead',
        useRecovery: 'Use a recovery code instead',
        back: 'Back',
        signIn: 'Sign in',
        createAdmin: 'Create admin account',
        signInDescription:
            'Sign in to sync diagrams to your QBase server. Accounts are created by an admin.',
        setupDescription:
            'This server has no users yet. The first account becomes its admin and can create everyone else.',
        email: 'Email',
        password: 'Password',
    },
    accountMenu: {
        signIn: 'Sign in',
        admin: 'Admin',
        adminSuffix: ' (admin)',
        thisProject: 'this project',
        projects: 'Projects',
        databaseConnections: 'Database connections',
        resync: 'Re-sync from database',
        share: 'Share',
        members: 'Members',
        adminPanel: 'Admin panel',
        changePassword: 'Change password',
        twoFactor: 'Two-factor authentication',
        signOut: 'Sign out',
    },
    changePassword: {
        forcedTitle: 'Choose your own password',
        title: 'Change password',
        forcedDescription:
            'An admin set a temporary password for your account. Enter it as the current password, then choose one only you know.',
        description: 'Enter your current password and choose a new one.',
        currentPassword: 'Current password',
        newPassword: 'New password',
        factor: 'Authenticator or recovery code',
        done: 'Password changed. Other devices were signed out.',
        submit: 'Change password',
        signOut: 'Sign out',
    },
    codeField: {
        recoveryLabel: 'Recovery code',
        authenticatorLabel: 'Authenticator code',
        recoveryPlaceholder: 'Recovery code',
        digitsPlaceholder: '6-digit code',
    },
    passwordField: {
        placeholder: 'Password',
        rules: 'Password rules',
        met: ' (met)',
        notMet: ' (not met)',
        rule: {
            min_length: 'At least {{length}} characters',
            uppercase: 'A capital letter',
            number: 'A number',
            symbol: 'A symbol, such as ! or #',
            email: 'Not your email address',
        },
    },
    signInPrompt: {
        needsSetup:
            'This server has no users yet. Create the admin account to get started.',
        signInSee:
            'Sign in to see your projects. Accounts are created by an admin.',
        signInOpen:
            'Sign in to open your projects. Accounts are created by an admin.',
        createAdmin: 'Create admin account',
        signIn: 'Sign in',
    },
    sessionEnded:
        'You were signed out. An account can only be signed in once at a time, so it may have been signed in on another device or browser.',
    poweredBy: 'Powered by',
    appShell: {
        needsServer:
            'Projects need a QBase server. Set VITE_QUBDI_BACKEND_URL and sign in to use them.',
    },
    listPager: {
        defaultNoun: 'items',
        none: 'No {{noun}}',
        range: '{{from}}–{{to}} of {{total}} {{noun}}',
        previous: 'Previous page',
        next: 'Next page',
    },
    searchInput: {
        clear: 'Clear search',
    },
    userPicker: {
        change: 'Choose a different user',
        placeholder: 'Search users by email…',
        label: 'Search users to assign',
        matching: 'Matching users',
        loading: 'Loading…',
        noMatch: 'No matching user that is not already assigned.',
        everyone: 'Everyone is already assigned.',
        narrow: ' Type more to narrow the search.',
    },
    members: {
        title: 'Members',
        fromProject:
            'Access to this diagram comes from its project. Ask an admin to change who can open or edit it.',
        description: 'Owners and editors can edit. Viewers can only read.',
        syncFirst:
            'Sync this diagram to the server first to see who has access.',
    },
    twoFactor: {
        title: 'Two-factor authentication',
        codesTitle: 'Save your recovery codes',
        codesDescription:
            'Each code works once, if you lose your phone. They are shown only now.',
        description:
            'Ask for a code from an app on your phone, as well as the password, when you sign in.',
        loading: 'Loading…',
        unavailable:
            'Two-factor sign-in is not available on this server. Whoever runs it can switch it on by setting an encryption key (SECRETS_KEY).',
        authenticatorApps:
            'Google Authenticator, Microsoft Authenticator, Authy, 1Password or any other authenticator app',
        offText:
            'It is <strong>off</strong>. Turn it on and a stolen password alone will not get anyone into your account.',
        setUp: 'Set up',
        stepInstall: 'Install {{apps}} on your phone.',
        stepScan:
            'Scan this code with the app, or choose “enter a key” and type the key below.',
        qrAlt: 'QR code for your authenticator app',
        stepType: 'Type the 6-digit code the app shows now.',
        stepPassword: 'Type your password to confirm it is you.',
        turnOn: 'Turn on',
        cancel: 'Cancel',
        recoveryCodes: 'Recovery codes',
        copied: 'Copied',
        copy: 'Copy',
        download: 'Download',
        savedLabel: 'I have saved these codes',
        savedText: 'I have saved these codes somewhere safe',
        done: 'Done',
        onText: 'It is <strong>on</strong>{{since}}. {{left}}',
        since: ' since {{time}}',
        codesLeft_one: 'You have {{count}} unused recovery code.',
        codesLeft_other: 'You have {{count}} unused recovery codes.',
        renewCodes: 'Make new recovery codes',
        turnOff: 'Turn off',
        renewHelp:
            'The old recovery codes stop working. Confirm with your password and a code from the app.',
        disableHelp:
            'Confirm with your password and a code from the app (or a recovery code).',
        password: 'Password',
        factor: 'Authenticator or recovery code',
        turnOffTwoFactor: 'Turn off two-factor',
        copyFailed: 'Copy failed. Select the codes and copy them by hand.',
        fileHeader: 'QBase recovery codes',
        fileNote: 'Each code works once. Keep them somewhere safe.',
    },
    home: {
        roleOwner: 'Admin',
        roleEditor: 'Editor',
        roleViewer: 'Viewer',
        title: 'Projects',
        description:
            'Each project is its own workspace. Open one to work on its database diagrams.',
        searchPlaceholder: 'Search projects…',
        searchLabel: 'Search projects',
        noMatch: 'No projects match “{{query}}”.',
        empty: 'No projects yet',
        adminCreate:
            'Create the first project in the <anchor>admin panel</anchor>.',
        notAssigned:
            'You are not assigned to any project yet. Ask an admin to add you to one.',
        list: 'Projects',
        diagrams_one: '{{count}} diagram',
        diagrams_other: '{{count}} diagrams',
        noun: 'projects',
        pageTitle: 'QBase - Projects',
    },
};
