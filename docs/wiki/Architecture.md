# Architecture

Gmail Storage Lens is a static, browser-only React application. The full description, including the data pipeline and rate-limit arithmetic, is in [docs/architecture.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/architecture.md). This page is the overview.

## Pieces

- **Sign-in:** Google Identity Services gives the browser an access token. The token stays in memory.
- **API layer:** requests to Gmail and Drive, with a rate-limited queue, batching, and backoff on errors.
- **Analytics:** pure functions that cluster senders and subjects, score items for safety and noise, build graphs, plan a cleanup budget, forecast intake, and export CSV. They do no I/O and are unit tested.
- **Workers:** scans and heavy computation, including the subject embedding (UMAP), run off the UI thread.
- **Saved scans (optional):** metadata written to IndexedDB only when you choose to save, encrypted with AES-256-GCM. The key comes from a passphrase (PBKDF2, 310,000 iterations). Wipe this device deletes it.
- **Incremental sync:** Gmail history and Drive changes fetch only what changed since the last scan.
- **User interface:** React views for the overview, explorers, the Airlock cleanup, and privacy verification.

## Data flow

1. Label summaries and Drive quota give fast first totals.
2. Gmail is scanned in size tiers, largest messages first.
3. Headers and sizes are fetched at a paced rate.
4. Workers compute clusters, scores, graphs, and embeddings.
5. The UI shows the results and the cleanup plan.

## Why it is paced

Gmail limits each user to 250 quota units per second, and a metadata fetch costs 5 units. That is at most 50 fetches per second, so a 40,000-message mailbox needs about 13 minutes at the theoretical limit. The app paces itself below the limit and retries on errors. Scanning the largest messages first means most of the useful answer arrives early.

## Where the code lives

| Area | Path |
|---|---|
| Analytics | `src/analytics/` |
| API | `src/api/` |
| Sign-in | `src/auth/` |
| Workers | `src/workers/` |
| Saved scans and encryption | `src/util/cache.ts`, `src/util/vault.ts` |
| Demo data | `src/demo/` |
| Components and charts | `src/components/`, `src/charts/` |
| Pages and state | `src/pages/`, `src/state/` |
| Public files | `public/` |

Module APIs are described in [docs/MODULES.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/MODULES.md).
