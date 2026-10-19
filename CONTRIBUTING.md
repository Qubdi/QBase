# **Contributing to QubdiDB**

Thank you for your interest in contributing to QubdiDB! We want to make your experience as easy as possible.

## How to Contribute

### Submitting Pull Requests

To submit a pull request:

1. Fork the repository, create a branch from `main`, and focus on a single change.
2. Write clear, concise commit messages and ensure your code follows the project's guidelines.
3. Open a pull request and clearly state what issue it addresses.
4. If needed, provide a brief explanation of your solution.
5. Submit your pull request for review.

### Reporting Bugs

If you find a bug, check [GitHub issues](https://github.com/qubdi/qubdidb/issues) to see if it’s already reported. If not, feel free to [report it](https://github.com/qubdi/qubdidb/issues/new?labels=bug).

For questions about using QubdiDB, [email the project maintainers](mailto:support@qubdi.dev). For feature requests, create a [new feature](https://github.com/qubdi/qubdidb/issues/new?labels=enhancement).

### Creating a Branch

To get started:

1. Fork [the repository](https://github.com/qubdi/qubdidb/fork).
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
cd server && npm run lint && npx vitest run   # server (needs the Postgres from `docker compose up -d db`)
```

The server tests create their own `qubdidb_test` database next to the one the app uses.

### License

By contributing, you agree that your work will be licensed under QubdiDB's [license](https://github.com/qubdi/qubdidb/blob/main/LICENSE).

## Questions?

Feel free to ask in `#contributing` on [Discord](https://discord.gg/QeFwyWSKwC) if you have questions about our process, how to proceed, etc.
or [email the project maintainers](mailto:support@qubdi.dev).

---

Thank you! 💙
