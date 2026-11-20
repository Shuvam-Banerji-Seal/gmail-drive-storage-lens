# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-20

### Added

- Demo mode with synthetic data, no sign-in required, and a guided first-run tour.
- Setup wizard: six steps with a progress diagram, a connection test with plain-language fixes, and a pre-filled setup link.
- Overview: quota orbit and capacity bar, KPI tiles, monthly intake chart with spike detection, a "full in N months" forecast, mailbox composition from Gmail label counts, explainable recommendations, top offenders across Gmail and Drive, and biggest wins ranked by noise score.
- Gmail explorer: senders, a sender constellation graph with Louvain communities and PageRank, Rivers (Sankey) flows, a Tides stream with time-machine replay and a sender-by-month heatmap, a Mailfall calendar heatmap, a Nebula subject map with lasso selection (embedding computed in a Web Worker), repeated attachments from reply chains, an unsubscribe radar, and an optional attachment structure scan with a type breakdown and a duplicate attachment graph.
- Drive explorer: Continents treemap and sunburst, Twins (duplicates by checksum with keep rules), Ghosts (old revisions that still count toward quota, with a prune action), cold files, a public-link audit, and a sharing graph.
- Planner with budget target, risk tolerance, and a what-if gauge. Insights with a domain chord diagram and people who appear in both Gmail and Drive.
- Airlock cleanup: a rule builder that shows the equivalent Gmail search, dry run, CSV export of the plan, optional `.mbox` archive download, a "Storage Lens/Review" label, Move to Trash with Undo, permanent delete with typed confirmation (`DELETE n`), emptying Drive Trash (`EMPTY TRASH`) and Gmail Trash or Spam (`EMPTY GMAIL TRASH`, `EMPTY SPAM`), a Gmail filter generator, a retention checklist download, receipts, and a redacted share card.
- Verify privacy page: a live map of every network request, a Content-Security-Policy probe, the enforced policy, build provenance, and what is stored on the device.
- Settings: themes (Auto, Atlas, Graphite, Paper, High contrast), a storage cap, client ID management, account switching, a restart option for the tour, encrypted scan save and load, and Wipe this device.
- Command palette (Ctrl/Cmd+K) and a responsive layout: sidebar on desktop, icon rail on tablets, app bar and bottom tab bar on phones.
- Incremental sync with "Sync changes", using Gmail history and Drive changes.
- `scripts/live-check.ts`: a read-only check against a real account that refuses non-GET requests.
- Community health files: contributing guide, code of conduct, security policy, support guide, and citation metadata.
- GitHub configuration: pull request and issue templates, CODEOWNERS, Dependabot, and the label catalogue.
- CI workflows for lint, typecheck, unit tests with coverage, build, Content-Security-Policy and licence checks, npm audit, end-to-end tests, CodeQL, dependency review, Lighthouse budgets, GitHub Pages deployment with build provenance, wiki sync, and tagged releases.
- Documentation: OAuth setup guide, privacy model, scope rationale, architecture, verification, and roadmap.
- Static SEO and PWA basics: robots, sitemap, web manifest, icon, and five standalone guide pages.

### Changed

- Permissions are requested per action. Sign-in asks only for read-only scopes. Trash, permanent delete, filters, and Drive cleanup each request their own scope when used.
- The review label works under `gmail.modify`. The app does not request `gmail.labels`.
- Fonts (Fraunces, IBM Plex Sans, IBM Plex Mono) are bundled with the app. No font is loaded from a remote host.
- Documentation describes the shipped features. The "planned" markers are removed.

### Security

- Scans saved on the device are encrypted with AES-256-GCM. The key is derived from a passphrase with PBKDF2-SHA-256 (310,000 iterations). Only metadata is stored, and OAuth tokens are never stored.
- Wipe this device deletes saved scans, signs out, revokes the token, and forgets the Client ID and preferences.
- Cleanup defaults to Trash. Starred, sent, and draft mail, and mail you sent, are blocked from deletion. Permanent deletion and emptying Trash or Spam need typed confirmation.
- Message content is read only in two opt-in cases: the attachment structure scan, which excludes body data, and the `.mbox` archive download. CI fails if a message body or raw-format request appears anywhere else.
- CI checks the network allowlist and the enforced Content-Security-Policy on every change.

## [0.1.0]

### Added

- Project scaffold: React, TypeScript, and Vite, with a strict Content-Security-Policy injected into production builds.
- Analytics core as pure, unit-tested functions: sender clustering, subject similarity, safety and noise scoring, budget planning, Drive duplicate and revision analysis, series and anomaly helpers, graph utilities, and CSV export with CSV-injection protection.
- Browser API layer for Gmail and Drive with a rate-limited request queue and backoff.
- Design language and module documentation.
- AGPL-3.0-or-later licence.

[Unreleased]: https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/releases/tag/v0.1.0
