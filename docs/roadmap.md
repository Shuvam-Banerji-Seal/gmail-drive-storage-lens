# Roadmap

This roadmap lists the milestones and the limits the project keeps. Shipped milestones are marked **Done**. Milestones shipped in a release are also recorded in [CHANGELOG.md](../CHANGELOG.md).

## Status

| Area | Status |
|---|---|
| Project scaffold, strict Content-Security-Policy, CI, Pages deployment | Done |
| Analytics core (clustering, scoring, graphs, planning, Drive analysis, CSV export) | Done, unit tested |
| Browser API layer for Gmail and Drive, with rate limiting and backoff | Done |
| Setup wizard and connection test | Done |
| Sign-in and Drive quota | Done |
| Gmail scan and explorer | Done |
| Visual views and linked charts | Done |
| Cleanup flow with Trash and confirmation | Done |

## Milestones

| # | Milestone | Contents | Status |
|---|---|---|---|
| 0 | Foundations | Repository, licence, CI, Pages deployment, Content-Security-Policy and its check, design tokens, demo data generator, user interface with synthetic data | Done |
| 0.5 | Setup wizard | Bring-your-own Client ID, format validation, a connection test, a pre-filled setup link, and plain-language explanations of common errors | Done |
| 1 | First sign-in | Read-only sign-in with your own client, Drive quota, and a Drive treemap | Done |
| 2 | Gmail scan | Tiered size-first scan, top senders, and a Gmail treemap | Done |
| 3 | Clustering and graphs | Mailing-list, domain, and subject clustering, a sender constellation graph with communities and PageRank, and a timeline | Done |
| 3b | More views | Sankey of bytes, calendar heatmap, time replay, and linked brushing between views | Done |
| 3c | Subject map and scores | Subject embedding map with lasso selection (UMAP in a Web Worker), noise and safety scores | Done |
| 4 | Drive duplicates | Duplicate detection by checksum with keep rules, revision-bloat finder, and recommendations | Done |
| 4b | Drive sharing | Sharing graph and a public-link audit | Done |
| 5 | Cleanup | Dry run, CSV export of the plan, Trash with Undo, typed confirmation for permanent deletes, and emptying Trash and Spam | Done |
| 5b | Cleanup helpers | Budget planner, `.mbox` archive before delete, a Gmail review label, a Gmail filter generator, unsubscribe radar, and retention checklist | Done |
| 6 | Polish | Guided first-run tour, command palette, themes, responsive layout, documentation. Accessibility and performance work continue. | Done |
| 6b | Sync and history | Incremental sync with Gmail history and Drive changes, an optional encrypted local save, and a storage timeline with forecast | Done |

Ideas that are not on the milestones above are welcome as discussions, but they are not commitments.

## Honest limits

These limits are part of the design. They will not be removed by a future release unless Google's APIs change.

- **Google Photos cannot be analysed.** The Photos Library API removed its read and search scopes in 2025. The app can only estimate Photos usage as the part of your quota that Drive and Gmail do not explain, and it labels that as an estimate.
- **Attachments cannot be removed alone.** The Gmail API cannot delete an attachment while keeping its message. The Airlock can download a `.mbox` archive of selected emails first, so you can keep a copy before moving the messages to Trash.
- **No background work.** The app runs only while its page is open. There is no scheduled or automatic cleanup. The Gmail filter generator is the closest substitute for keeping a mailbox tidy.
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
