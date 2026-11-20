## Summary

<!-- What does this change do, and why? Link the issue it resolves, for example "Closes #123". -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behaviour)
- [ ] Documentation only
- [ ] Refactor, performance, or tooling (no behaviour change)
- [ ] Dependency update

## Testing

<!-- How did you verify this? Include the commands you ran and any manual steps. -->

- [ ] `npm run lint`, `npm run typecheck`, and `npm run test:cov` pass locally
- [ ] `npm run build` succeeds
- [ ] `npm run check:csp` and `npm run check:licenses` pass
- [ ] New or changed behaviour has tests (unit, end-to-end, or a clear manual test plan below)

Manual test plan (if relevant):

## Privacy checklist

All boxes must be ticked, or the pull request must explain why one does not apply.

- [ ] This change adds no new network host (no CDN, font, analytics, or telemetry endpoint, and no new entry in the Content-Security-Policy)
- [ ] This change fetches no message bodies or attachment or file contents. Gmail requests use metadata or a `fields` mask that excludes bodies.
- [ ] No secrets, tokens, client secrets, API keys, personal data, or real mailbox or Drive data are added to code, tests, fixtures, or screenshots
- [ ] Any new destructive action defaults to Trash where possible, shows a dry run, and needs explicit confirmation

## Documentation

- [ ] Docs are updated where this change affects them (README, `docs/`, the wiki, or the OAuth setup guide)
- [ ] `CHANGELOG.md` has an entry under `Unreleased` (for user-visible changes)
- [ ] Screenshots, if any, use demo data only

## Notes for reviewers

<!-- Anything you want a reviewer to look at first, known limitations, or follow-up work. -->
