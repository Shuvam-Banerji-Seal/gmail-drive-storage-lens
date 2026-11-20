# Features

Gmail Storage Lens is in early development. Items marked **(planned)** are on the [roadmap](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/roadmap.md) and are not yet available.

## Overview

A summary of your Google storage. It shows the split between Drive and Gmail, and Google Photos as an estimate, since Photos usage cannot be read directly. (planned)

## Gmail explorer

- **Sizes by group.** Treemap and sunburst views, grouped by sender domain, sender, and thread. (planned)
- **Mailing lists and clusters.** Messages are grouped by mailing list identifier, by sender, and by similar subject lines. (planned)
- **Timeline.** Bytes per month for each cluster, so you can see when storage grew. (planned)
- **Read rate.** The share of each sender's messages you have not read, which helps you spot senders you rarely open. (planned)
- **Sender graph.** Senders as nodes, linked when they share threads or mailing lists. (planned)

## Drive explorer

- **Folder treemap** by storage used. (planned)
- **Duplicates** found by checksum, grouped so you can choose which copy to keep. (planned)
- **Lists** of large, old, public, and trashed files. (planned)
- **Revision bloat.** Old versions that keep counting toward your quota. (planned)

## Cleanup

- **Selection** by group, by filter, or by a rule you define. (planned)
- **Dry run.** An exact list, total bytes, and previews, with protected items excluded by default. Starred, sent, drafts, and messages from you or your contacts are protected. (planned)
- **CSV export** of the plan. (planned)
- **Trash first.** Items go to Trash, which can be restored for a limited time.
- **Permanent delete** needs a separate confirmation in which you type the number of items. (planned)

## Setup

- **Bring your own client.** A guided wizard that walks you through the Google console, checks your Client ID format, and tests the connection with plain-language fixes. (planned)
- **Demo mode.** Explore every view with synthetic data. (planned)

## Accessibility

- Keyboard navigation for lists and charts. (planned)
- A text or table alternative for every chart.
- Respect for reduced-motion settings.
- Light, dark, and high-contrast themes. (planned)

## What it will not do

- It will not send email or change message contents.
- It will not download message bodies or file contents.
- It will not remove an attachment while keeping its message, because the Gmail API does not allow it.
- It will not analyse Google Photos libraries, because Google removed the necessary read scopes.
- It will not run in the background or clean up on a schedule.
