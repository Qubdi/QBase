# Security

[← Back to the README](../README.md)

## Passwords

A password that is being **set** (the first admin's sign-up, changing your own, an admin creating a user or resetting one) must have:

- at least `PASSWORD_MIN_LENGTH` characters (12 unless you change it; never fewer than 8) and at most 200,
- a capital letter, a number and a symbol (any character that is not a letter, a number or a space; spaces are allowed but do not count). Letters and digits from other alphabets count, so a Georgian or Cyrillic capital works,
- nothing that is the account's email address or contains the part before the `@` (a part shorter than 3 characters is not compared),
- and, when changing it, not the same as the current password.

The forms show these as a checklist while you type; the server checks them again and answers `400 { "error": "weak_password", "rules": [...] }` listing what is missing.

Signing in does not apply the rules, so people who chose a password before they existed keep working, and nobody is asked to change one. Passwords are stored only as argon2 hashes.

An admin who creates a user or resets a password is choosing a **temporary** password: the person is asked to choose their own at their next sign-in and can do nothing else until they have (the API answers `403 password_change_required`). Signing out is always possible.

## Two-factor sign-in (authenticator app)

After the password, a person can be asked for the 6-digit code their authenticator app shows. It is the standard TOTP of RFC 6238 (SHA-1, 6 digits, 30 seconds), so Google Authenticator, Microsoft Authenticator, Authy, 1Password and any other TOTP app work, by scanning a QR code or typing a key. It is **not** "sign in with Google or Microsoft": nothing is sent to a third party.

- **Optional, and it works offline.** It is off for everyone until a person turns it on (account menu, *Two-factor authentication*); anyone who never does keeps signing in with the password only. Codes are calculated on the phone from a shared secret and the clock, and checked the same way by the server, so neither side needs the internet. The QR code is drawn in the browser by a library bundled with the editor: no CDN, no external request.
- **Turn it on for the server:** set `SECRETS_KEY` (or `CONNECTION_KEY`, which is used when `SECRETS_KEY` is unset), at least 32 characters, and keep it safe. With no key the entry is not shown and nothing is an error. `MFA_ENABLED=false` removes the feature completely. In local-only mode (no server) there are no accounts, so there is no two-factor either.
- **The server's clock must be right.** A code is accepted within about 30 seconds either side of now (`MFA_WINDOW_STEPS`, default 1). On an offline or air-gapped machine keep the clock correct (NTP, or set it by hand); a clock that is minutes out rejects every code.
- **How it works:** after a correct password the server answers `{ "mfaRequired": true, "challenge": "..." }` and sets no cookie; `POST /auth/login/mfa` with the ticket and a code (or a recovery code) then starts the session. A ticket lasts 5 minutes and dies after 5 wrong codes, wrong codes also count against the account's lockout (`AUTH_MAX_FAILURES`), and a code can be used only once. The secret is stored encrypted (AES-256-GCM) and never returned after set-up; the 10 recovery codes are stored as hashes and shown once. Turning it on needs the password, so a stolen session cannot lock the owner out with a second factor they do not have. Turning it off, making new recovery codes and changing the password need the password and/or a code.
- **A lost phone:** use a recovery code (each works once). Otherwise an admin opens *Admin > Users* and chooses *Reset two-factor* for that person, who is signed out everywhere and can sign in with the password alone. Resetting another *administrator's* password or two-factor asks the acting admin for their own password (and a code from their authenticator app or a recovery code, if they have two-factor on), so a stolen admin session alone cannot take over another admin; making someone an administrator (creating an admin account or promoting one) and deleting a project, which removes everything in it, ask for the same proof. A wrong password counts against the same lockout as changing your own. If the only admin is locked out, run on the server `npm run mfa:reset -- person@example.com` (from `server/`), or in Docker `docker compose exec app node dist/server/src/cli/mfa-reset.js person@example.com`.
- **Upgrading from a version that stored recovery codes without the `k1:` prefix:** the first start after the upgrade deletes every unused recovery code stored the old way (migration `0026`), because the oldest ones were a bare sha256 that could be tested offline and the two kinds cannot be told apart. Two-factor stays on and the authenticator still works; people see *0 unused recovery codes* in their account settings and make new ones there. Anyone who had lost their phone and was relying on an old code needs an admin to *Reset two-factor*.
- **Activity log:** `mfa.setup`, `mfa.enable`, `mfa.disable`, `mfa.reset`, `mfa.recovery_used`, `mfa.recovery_renew` and `mfa.failed`.

## Read-only database import

Every introspection query is a fixed catalog `SELECT`, checked by a guard
before it is sent, and PostgreSQL runs inside a read-only transaction. SQL Server has no
read-only transaction, and the connection's `readOnlyIntent` only tells a cluster which
replica to use; it blocks nothing. So the login you give QBase is the real limit: make
one that can only read the catalog, and never use `sa` or a member of `sysadmin` or
`db_owner`. QBase checks this when it connects: a login that is a `sysadmin` or a
`db_owner` is refused (`privileged_login`) unless the operator sets
`INTROSPECT_ALLOW_PRIVILEGED=1`.

```sql
CREATE LOGIN qbase_reader WITH PASSWORD = '<a long random password>';
USE <database>;
CREATE USER qbase_reader FOR LOGIN qbase_reader;
GRANT VIEW DEFINITION TO qbase_reader;
```
