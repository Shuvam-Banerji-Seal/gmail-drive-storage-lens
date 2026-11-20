# Roadmap

This roadmap lists the planned milestones and the limits we expect to keep. Each milestone is subject to change. Milestones shipped in a release are recorded in [CHANGELOG.md](../CHANGELOG.md).

## Status

| Area | Status |
|---|---|
| Project scaffold, strict Content-Security-Policy, CI, Pages deployment | In place |
| Analytics core (clustering, scoring, graphs, planning, Drive analysis, CSV export) | In place, unit tested |
| Browser API layer for Gmail and Drive, with rate limiting and backoff | In place |
| Setup wizard and connection test | Planned |
| Sign-in and Drive quota | Planned |
| Gmail scan and explorer | Planned |
| Visual views and linked charts | Planned |
| Cleanup flow with Trash and confirmation | Planned |

## Milestones

| # | Milestone | Contents |
|---|---|---|
| 0 | Foundations | Repository, licence, CI, Pages deployment, Content-Security-Policy and its check, design tokens, demo data generator, user interface with synthetic data |
| 0.5 | Setup wizard | Bring-your-own Client ID, format validation, a connection test, and plain-language explanations of common errors |
| 1 | First sign-in | Read-only sign-in with your own client, Drive quota, and a Drive treemap |
| 2 | Gmail scan | Tiered size-first scan with resume, top senders, and a Gmail treemap |
| 3 | Clustering and graphs | Mailing-list, domain, and subject clustering, a sender network graph, and a timeline |
| 3b | More views | Sankey of bytes, calendar heatmap, streamgraph, and linked brushing between views |
| 3c | Subject map and scores | Subject embedding map with lasso selection, noise and safety scores |
| 4 | Drive duplicates | Duplicate detection by checksum, revision-bloat finder, and recommendations |
| 4b | Drive sharing | Sharing graph and an audit of files shared by link |
| 5 | Cleanup | Dry run, CSV export of the plan, Trash, undo for the session, and the permanent-delete gate |
| 5b | Cleanup helpers | Budget planner, archive before delete, a Gmail review label, filter generator, and the unsubscribe radar |
| 6 | Polish | Onboarding, accessibility review, performance for large graphs, and documentation |
| 6b | Sync and history | Incremental sync with Gmail history and Drive changes, an optional encrypted local cache, and a storage timeline with forecast |

Ideas that are not on the milestones above are welcome as discussions, but they are not commitments.

## Honest limits

These limits are part of the design. They will not be removed by a future release unless Google's APIs change.

- **Google Photos cannot be analysed.** The Photos Library API removed its read and search scopes in 2025. The app can only estimate Photos usage as the part of your quota that Drive and Gmail do not explain, and it labels that as an estimate.
- **Attachments cannot be removed alone.** The Gmail API cannot delete an attachment while keeping its message. Archive-then-delete is planned as the alternative.
- **No background work.** The app runs only while its page is open. There is no scheduled or automatic cleanup. Gmail filters (planned) are the closest substitute for keeping a mailbox tidy.
- **Numbers are estimates.** Gmail sizes come from message metadata, and Google's storage page can lag by minutes to hours. "Bytes freed" is an estimate until Google's page updates.
- **Quota is per user, and real.** Large mailboxes take time to scan. The app paces requests and retries, but it cannot exceed Google's limits.
- **Workspace policies can block setup.** An administrator may stop third-party apps or Cloud project creation. The app cannot override that.
- **Testing-mode consent.** Apps in Testing mode may need you to sign in again more often. This is acceptable for personal use.
- **Scope names may change.** Google may change scope names or consent wording. We re-check them before each release.

## Not planned

- A hosted backend, accounts, or any server that stores your data.
- Analytics or tracking of any kind.
- Sending email, or modifying message contents.
- Publishing the app for general use under a shared OAuth client. Each user brings their own client, which avoids Google's verification process for restricted scopes.
