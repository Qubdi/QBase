# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email
**support@qubdi.dev** with:

- what you found and where (route, file or setting),
- the steps to reproduce it,
- the version or commit you tested.

We aim to acknowledge a report within 3 working days and to tell you what we
plan to do within 10. Please give us a reasonable time to fix the problem
before you share it more widely.

## Supported versions

Only the latest release is supported with security fixes.

## Scope

In scope: the editor, the backend in `server/`, and the Docker images built
from this repository.

Out of scope: problems that need a malicious server administrator, and
findings that only apply to a deployment with the documented secrets
(`SESSION_SECRET`, `CONNECTION_KEY`, database passwords) left at their example
values. Set your own before exposing QubdiDB.
