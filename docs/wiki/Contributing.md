# Contributing

Thank you for wanting to help. The full guide is [CONTRIBUTING.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/CONTRIBUTING.md). This page gives the short version.

## Set up

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev
```

## Before you open a pull request

Run these locally:

- `npm run lint`
- `npm run typecheck`
- `npm run test:cov`
- `npm run build`
- `npm run check:csp`
- `npm run check:licenses`

## Rules that always apply

- No network hosts beyond the allowlist.
- Metadata only: never message bodies, attachments, or file contents.
- No analytics or tracking.
- No secrets, tokens, or real personal data in code, tests, or screenshots.
- Destructive actions default to Trash and need explicit confirmation.

## Commits and pull requests

- Use Conventional Commits, for example `feat(drive): group duplicates by checksum`.
- Keep pull requests focused, and fill in the privacy checklist.
- Update the docs and the changelog when your change affects users.

## Good places to start

- Issues labelled `good first issue`.
- Documentation and wiki improvements.
- Accessibility fixes.

See also [[Architecture|Architecture]] for how the code is organised.
