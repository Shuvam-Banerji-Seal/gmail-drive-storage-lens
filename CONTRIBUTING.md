# Contributing to Gmail Storage Lens

Thank you for helping make Gmail Storage Lens better. This guide explains how to set up a development environment, what we check before merging, and the rules that protect our users' privacy.

Please also read our [Code of Conduct](CODE_OF_CONDUCT.md). For security problems, do not open a public issue; follow [SECURITY.md](SECURITY.md).

## Ways to help

- Report bugs or confusing setup steps using the issue templates.
- Improve the documentation, the OAuth setup guide, or the wiki.
- Fix accessibility problems (keyboard use, screen readers, contrast, reduced motion).
- Pick up an issue labelled `good first issue` or `help wanted`.
- Propose features in [Discussions](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/discussions) before large changes.

## Development setup

Requirements: **Node.js 24** and npm.

```bash
npm ci          # install exactly what package-lock.json specifies
npm run dev     # start the Vite dev server at http://localhost:5173
```

Use `npm ci`, not `npm install`, so your lockfile stays unchanged unless you intentionally change a dependency.

To test sign-in locally, create your own OAuth client and add `http://localhost:5173` as an authorized JavaScript origin. The steps are in [docs/oauth-setup.md](docs/oauth-setup.md). Never commit a client secret, token, or `.env` file.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run lint` | oxlint over the source |
| `npm run typecheck` | `tsc -b` (strict TypeScript) |
| `npm run format:check` / `npm run format` | Prettier check and fix |
| `npm run test` | Unit tests once (Vitest, jsdom) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:cov` | Unit tests with coverage (the CI gate) |
| `npm run build` | Type-check and production build |
| `npm run preview` | Serve the production build locally |
| `npm run check:csp` | Fails if a network host outside the allowlist appears in source or the CSP is loosened |
| `npm run check:licenses` | Fails if a dependency licence is incompatible with AGPL-3.0 |
| `npm run e2e` | Playwright end-to-end tests |
| `npm run live-check` | Manual check against live Google APIs (requires your own credentials; not run in CI) |

## Running the end-to-end tests

End-to-end tests use Playwright against the production build.

```bash
npm ci
npx playwright install --with-deps chromium   # first time only
npm run build
npm run e2e
```

The tests must not need real Google accounts. Use demo data or mocked Google endpoints. If a test fails in CI, download the `playwright-report` artifact from the workflow run and open `index.html` in it.

## Branches and pull requests

1. Fork the repository, or, if you have write access, create a branch from `main`. Name it after its purpose, for example `fix/origin-hint-text` or `feat/duplicate-finder`.
2. Keep each pull request focused on one change. Split unrelated work into separate pull requests.
3. Make sure `npm run lint`, `npm run typecheck`, `npm run test:cov`, `npm run build`, `npm run check:csp`, and `npm run check:licenses` all pass locally.
4. Fill in the pull request template, including the privacy checklist.
5. Update the docs that your change affects (README, `docs/`, the wiki, or `CHANGELOG.md` under `Unreleased`).
6. A maintainer reviews and merges. We prefer squash merges so the history on `main` reads as one commit per change.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(optional scope): <short imperative summary>

<optional body explaining why>
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `revert`. Examples:

- `feat(drive): group duplicate files by md5 checksum`
- `fix(auth): show a clear message when the origin is not authorized`
- `docs(oauth): clarify where to add the authorized JavaScript origin`

Keep the summary under about 72 characters and write it in the imperative mood.

## Tests are required

- Changes to `src/analytics/`, `src/api/`, or `src/util/` need unit tests. Coverage is measured for these directories.
- Bug fixes should include a test that fails before the fix and passes after it.
- User-facing flows should have an end-to-end test or a clear manual test plan in the pull request.

## Project rules

These rules are not optional. Reviewers will ask you to change code that breaks them.

1. **No network hosts beyond the allowlist.** The app may contact only the hosts listed in the Content-Security-Policy in `vite.config.ts`: `www.googleapis.com`, `gmail.googleapis.com`, `accounts.google.com`, and `oauth2.googleapis.com`, plus Google's sign-in script. Do not add CDNs, fonts, analytics, error reporters, or any other host. Changing the list requires a discussion first and an update to `check:csp`.
2. **Metadata only.** Request headers, sizes, labels, and file metadata. Never fetch or store message bodies, attachment contents, or file contents. The Gmail `format` parameter must be `metadata` (or a `fields` mask that excludes body content).
3. **No analytics or tracking.** No analytics SDKs, pixels, session replay, or telemetry, including "anonymous" or opt-out versions.
4. **No secrets in the repository.** No client secrets, tokens, API keys, or personal data, including in tests and fixtures. Demo data must be synthetic.
5. **Destructive actions stay gated.** Anything that deletes or permanently removes data must default to Trash where possible, show a dry run first, and require explicit confirmation.
6. **Accessibility.** Charts need a text or table alternative, and motion must respect `prefers-reduced-motion`.
7. **Strictness.** TypeScript strict mode stays on. Do not add `any` or `@ts-ignore` without a comment explaining why.

## Dependencies

- Keep dependencies minimal and justify each new one in the pull request.
- Licences must be compatible with AGPL-3.0-or-later (for example MIT, BSD, ISC, Apache-2.0, or MPL-2.0). `npm run check:licenses` enforces this.
- Dependabot opens weekly update pull requests. Review them like any other change.
- Commit `package-lock.json` changes together with the `package.json` change that caused them.

## Licence of your contributions

By contributing, you agree that your contribution is licensed under the GNU Affero General Public License v3.0 or later, the same licence as the project. Do not submit code you do not have the right to share.

## Questions

Open a [Discussion](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/discussions) for questions. Use an issue only for a concrete bug or a specific, actionable task.
