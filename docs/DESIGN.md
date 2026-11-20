# Design language: "Observatory"

Storage is invisible, so the UI makes it look like a night sky you can explore.

| Data | Metaphor | Chart |
|---|---|---|
| Quota | **Orbit**: concentric rings, each ring a service | `QuotaOrbit` |
| Folders / sender hierarchy | **Continents** | zoomable `Treemap`, `Sunburst` |
| Sender relationships | **Constellation** | `ForceGraph` (communities = colour) |
| Bytes flowing origin -> action | **Rivers** | `Sankey` |
| Bytes per month per cluster | **Tides** | `Stream` |
| Bytes per day | **Mailfall** | `CalendarHeatmap` |
| Subject similarity | **Nebula** | `Scatter` with lasso |
| Duplicates | **Twins** | grouped list |
| Old pinned revisions | **Ghost weight** | list |
| Unread mailing lists | **Static** | radar list |
| Confirm + delete | **Airlock** | dry run + typed confirmation |
| Result | **Boarding pass** | receipt + share card |

Principles: dark-first with a light "Paper" theme and a high-contrast theme; one accent (aurora mint) plus a fixed
8-colour categorical palette (`--series-1..8`, colour-blind aware, never the only encoding: always add labels);
system fonts only (no remote fonts, the CSP forbids them); motion is decorative and disabled under
`prefers-reduced-motion`; every chart has a table or text alternative; destructive buttons are visually distinct and
always behind a confirmation.
