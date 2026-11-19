# **Contributing to QBase**

Thank you for your interest in contributing to QBase! We want to make your experience as easy as possible.

## How to Contribute

### Submitting Pull Requests

To submit a pull request:

1. Fork the repository, create a branch from `main`, and focus on a single change.
2. Write clear, concise commit messages and ensure your code follows the project's guidelines.
   Releases are generated from them, so use [Conventional Commits](https://www.conventionalcommits.org/):
   `fix(server): reject empty names`, `feat(client): add a share dialog`, `docs: fix a typo`. The pull
   request title follows the same form (a check enforces it), since it becomes the commit when the PR is squashed.
   A `commit-msg` git hook (installed with `npm install`) refuses a commit message that is not in this form.
3. Open a pull request and clearly state what issue it addresses.
4. If needed, provide a brief explanation of your solution.
5. Submit your pull request for review.

### Reporting Bugs

If you find a bug, check [GitHub issues](https://github.com/qubdi/qbase/issues) to see if it’s already reported. If not, feel free to [report it](https://github.com/qubdi/qbase/issues/new?labels=bug).

For questions about using QBase, [email the project maintainers](mailto:support@qubdi.com). For feature requests, create a [new feature](https://github.com/qubdi/qbase/issues/new?labels=enhancement).

### Creating a Branch

To get started:

1. Fork [the repository](https://github.com/qubdi/qbase/fork).
2. Create a branch from `main`.
3. If you’re new to GitHub pull requests, check out [this video series](https://egghead.io/courses/how-to-contribute-to-an-open-source-project-on-github).

### Contributor License Agreement

Before a first pull request can be merged you sign the [CLA](CLA.md). A bot comments on the pull
request with how; it takes one reply.

### Setting up

You need Node 24 (see `.nvmrc`) and Docker. The steps in the [README](README.md#run-it) start the
database, the server and the editor.

### Running the tests

```bash
npm run lint && npx vitest run       # editor: lint and tests
npm run build                        # editor: lint, type check and bundle
cd server && npm run lint && npm run typecheck && npx vitest run   # server (tests need the Postgres from `docker compose up -d db`, started with POSTGRES_USER=qbase, POSTGRES_PASSWORD=qbase and any CONNECTION_KEY of 16 or more characters, which Compose requires even to start only the database)
```

The server tests create their own `qbase_test` database next to the one the app uses. By default they connect as `qbase`/`qbase` on `localhost:5433`; set `TEST_PG_PORT`, `TEST_PG_USER` and `TEST_PG_PASSWORD` to use another port, user or password.

Two optional editor scripts: `npm run test:ui` opens the Vitest browser UI, and `npm run test:coverage` writes a coverage report.

### License

By contributing, you agree that your work will be licensed under QBase's [Apache License 2.0](LICENSE), as Section 5 of that licence says for any contribution you submit, and under the terms of the [CLA](CLA.md).

## Questions?

[Email the project maintainers](mailto:support@qubdi.com) if you have questions about our process, how to proceed, etc.

---

Thank you! 💙
