# BH Platform: working rules

These rules apply to every task.

## Language
- Code, identifiers, file names, routes, code comments, MCP tool descriptions, commit messages and pull request texts are English.
- Text that users see and documentation stay German. Answer the user in German unless they write another language.

## Git workflow
- Commit after every finished task, in small coherent commits. Pushing happens automatically on feature branches when you finish.
- Never work on `main` or `master` once they exist on the remote: `git switch -c <type>/<short-description>`.
- Commit subject: `<type>(<scope>): <english summary>` with type feat, fix, chore, docs, test, refactor, perf, style, build or ci. The body explains why.
- Stage specific paths and read `git diff --cached --stat` before committing.
- Never use `--force`, `--no-verify`, `git reset --hard`, `git clean -f`, `git checkout .` or `git restore .`. If one seems necessary, explain why and let the user run it.
- Never commit secrets. They belong in `.env`, which stays out of Git.

## Pull requests
- One concern per pull request. Create it with `github_pr_create` and `draft: true`.
- Read `github_pr_review_radar` before acting on a pull request. The owner decides on review disputes.
- Merge only with green checks and only when the user asks for it.

## Quality
- Understand existing code first and extend it. Name things so they read in 30 seconds. Comments explain why.
- Add or adapt tests with every behaviour change and run them before you commit. Report honestly if something fails or was not verified.
- Versions follow `YY.M.N` as described in the coding rules, raised in the same commit.

## Data
- Default database is SQLite through `node:sqlite`: one file per app, WAL mode, `PRAGMA foreign_keys = ON`. It fits this small server and needs no extra process.
- Do not start database servers such as PostgreSQL, MySQL or Redis in the container, there is neither memory nor Docker. Use a hosted database over the internet only if the app must really serve many concurrent writers, and ask the user first.
- Keep the path in `DATA_DIR`, outside Git. For public apps the database and `.env` must stay outside the app folder, in `~/app-data/<app>/`, otherwise the guard revokes the release.
- Change schemas through numbered, forward-only migrations in the repository. Group related writes in transactions, add indexes for real queries, use bound parameters only.
- Store times as UTC ISO 8601 and money as integer cents. Files go on disk with their path in the database, not as blobs. JSON files are only for small settings.
- Back up with `VACUUM INTO` or the SQLite backup API. Never copy a live database file, the WAL holds recent writes. Backups are not automatic.

## User accounts
- Apps for platform users use the platform login and need no accounts. Public apps that need accounts follow the skill `bh-app-accounts`.

## Building web apps
- The skill `bh-webapp-skeleton` is an offer for classic web apps, it brings design, login, database and tests.
- Games and other free applications may ignore it and have their own look, menus and navigation.
- An app that becomes a platform app needs its own icon in the platform style: blue gradient tile, white motif that fits the app, set in `scripts/app-icon.json`. The letter B belongs to the platform.
- Keep AI calls on the central LLM gateway and tools on the MCP gateway. Never call a model provider directly or ask for API keys.
