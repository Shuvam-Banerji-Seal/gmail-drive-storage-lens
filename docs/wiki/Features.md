# Features

Gmail Storage Lens has four main areas: an overview, an explorer for Gmail and one for Drive, and a cleanup area called the Airlock. Every chart also has a text or table alternative. Everything below is available now, and the demo shows each view with synthetic data.

## Overview

- **Quota orbit and capacity bar.** Your Google storage split across Drive, Gmail, and an estimate for Google Photos, since Photos usage cannot be read directly.
- **KPI tiles** and a **monthly intake chart** with spike detection, so you can see when storage grew.
- **Full in N months.** A forecast from your recent intake rate.
- **Mailbox composition** from Gmail label counts.
- **Recommendations.** Each one explains the rule behind it and how much space it would free.
- **Top offenders** across Gmail and Drive, and **biggest wins** ranked by noise score.

## Gmail explorer

The Gmail page has tabs, each with a different view of the same scan:

- **Senders.** Largest senders and their message counts and sizes.
- **Constellation.** A force-directed graph of senders, coloured by community (Louvain) and ranked by PageRank.
- **Rivers.** A Sankey diagram of where the bytes flow, from sender to label or category.
- **Tides.** A stream of bytes over time, a **time machine** that replays the mailbox month by month, and a sender-by-month heatmap.
- **Mailfall.** A calendar heatmap of mail volume.
- **Nebula.** A map of subject similarity, computed in a background worker. Select a region with the lasso to add those messages to the Airlock.
- **Repeats.** Reply chains that keep re-storing the same attachment.
- **Attachments.** An optional scan of attachment structure: names, types, and sizes only. It never reads message or attachment content. It shows a type breakdown and a graph of duplicate attachments.
- **Unsubscribe radar.** Senders that publish an unsubscribe link, sorted by storage used, with your read rate for each.

## Drive explorer

- **Continents.** A folder treemap and sunburst, sized by storage used.
- **Twins.** Duplicate files found by checksum, grouped so you choose which copy to keep.
- **Ghosts.** Old revisions that keep counting toward your quota. You can prune the ones you pin as "keep forever". The current version is never removed.
- **Cold files.** Files you own that are at least 10 MB and were last viewed or changed more than two years ago.
- **Public links.** An audit of files shared by link.
- **Sharing graph.** Who has access to what, drawn as a graph.

## Insights and planner

- **Insights.** A domain chord diagram showing which sender domains appear together, and a graph of people who appear in both Gmail and Drive.
- **Planner.** Set a storage budget and a risk tolerance, and see a what-if gauge that shows how far a cleanup would take you.

## Airlock (cleanup)

The Airlock is where you choose items and act on them. Nothing changes until you confirm.

- **Rule builder.** Select mail or files by rule. The page shows the equivalent Gmail search.
- **Dry run.** An exact list, total bytes, and the items excluded by protection rules. Starred, sent, and draft mail, and mail you sent, are always blocked. High-risk mail is left out of suggested targets.
- **CSV plan.** Export the plan before you act.
- **Archive.** Download a `.mbox` file of the selected emails to your device. This is the only way to keep a copy of message content.
- **Review label.** Add a "Storage Lens/Review" label to selected emails, so you can look through them in Gmail first.
- **Move to Trash**, with an Undo option for the current session. Trash keeps items for 30 days.
- **Permanent delete** needs a separate confirmation in which you type the number of items, for example `DELETE 299`.
- **Empty Trash and Spam.** Drive Trash needs `EMPTY TRASH`. Gmail Trash needs `EMPTY GMAIL TRASH`, and Gmail Spam needs `EMPTY SPAM`.
- **Gmail filter generator.** Build a Gmail filter from a rule you define. You review it before it is created.
- **Retention checklist.** Download a checklist of what you cleaned and what to review later.
- **Receipts** for each action, and a redacted share card you can post without personal details.

## Verify privacy

A page that shows what the app is doing:

- A live map of every network request this tab has made.
- A probe that tries to reach a non-Google host. The browser's policy should block it.
- The Content-Security-Policy the browser is enforcing.
- Build provenance: the commit the page was built from, and the command to verify it.
- What is stored on this device, and how to remove it.

## Setup

- **Setup wizard.** Six steps with a progress diagram, from creating your Google Cloud project to signing in.
- **Connection test.** Checks sign-in, Drive, and Gmail access, and shows a plain-language fix for each failed check.
- **Pre-filled setup link.** Copy a link that opens the setup wizard with your Client ID already filled in, for another browser or device.
- **Demo mode.** Explore every view with synthetic data, without signing in.

## Settings

- **Themes:** Auto, Atlas, Graphite, Paper, and High contrast.
- **Storage cap** and scan depth.
- **Save and load a scan.** Save the scan on this device, encrypted with a passphrase you choose. Load it later and sync only the changes.
- **Switch account**, and **restart the tour**.
- **Wipe this device.** Signs out, revokes the token, deletes saved scans, and forgets your Client ID and preferences.

## Using it

- **Command palette.** Press Ctrl+K (or Cmd+K on macOS) to jump to any view or action.
- **Sync changes.** Fetch only what changed since the last scan, using Gmail history and Drive changes.
- **Responsive layout.** A sidebar on desktop, an icon rail on tablets, and an app bar with a bottom tab bar on phones.

## What it will not do

- It will not send email or change message contents.
- It will not download message content, except in the two opt-in cases: the attachment structure scan (which excludes body data) and the `.mbox` archive download you start yourself.
- It will not remove an attachment while keeping its message, because the Gmail API does not allow it.
- It will not analyse Google Photos libraries, because Google removed the necessary read scopes.
- It will not run in the background or clean up on a schedule. Gmail filters are the closest substitute.
