# Privacy

This document describes what Gmail Storage Lens reads, where it is stored, what leaves your browser, and how to delete it. It also explains how you can check these claims yourself.

Some parts below describe the intended behaviour of features that are still being built. Those are marked **(planned)**. The principles apply to every release, including the current one.

## Summary

- The app runs entirely in your browser as static files. There is no server that receives your data.
- It reads **metadata only**: message headers, sizes, labels, and Drive file metadata. It never downloads message bodies, attachments, or file contents.
- Your data is stored **in your browser** and is cleared when you sign out.
- The only destinations are **Google's own APIs and sign-in endpoints**. The browser enforces this with a Content-Security-Policy.
- The project has **no analytics, no tracking, no advertising, and no third-party scripts** other than Google's sign-in library.

## Who holds what

| Party | What they hold |
|---|---|
| You | Your Google account, your Google Cloud project, and your OAuth client |
| Google | Your account and the requests the app makes to Google's APIs, under Google's own terms and privacy policy |
| The project maintainers | Nothing about you. They do not receive your Client ID, tokens, or data. |
| The GitHub Pages host | Standard web-server logs for requests to the static files (the app code, not your data) |

Note that the GitHub Pages host sees ordinary requests for the app's files, as any website host does. It does not receive your Google data, because the app sends those only to Google.

## What the app reads

### Gmail (metadata)

The app asks Gmail for the following fields of each message. It never requests message bodies.

- Headers: `From`, `To`, `Cc`, `Subject`, `Date`, `List-Id`, `List-Unsubscribe`, and thread and message identifiers
- `sizeEstimate`: the approximate size of the message in bytes
- `labelIds`: the labels on the message, such as Inbox, Starred, or categories
- Counts per label, from the label summaries

Gmail does not offer a per-user storage total, so the app sums the sizes of messages it reads.

### Drive (metadata)

- File identifiers, names, MIME types, sizes, checksums (`md5Checksum` and similar), parent folders, modified and viewed times, ownership, sharing flags, and trashed status
- Quota figures from Drive's storage summary
- Revision sizes, for files where the app checks for old versions

The app does not download file contents.

### What it never reads

- Message bodies and the text of any message
- Attachment contents
- File contents, including Google Docs, Sheets, and Slides text
- Contacts, calendar, photos, or any other Google service

## Where data is stored

- **Access token:** held in memory only, for the current session. It is not written to `localStorage` or any other storage, and it expires after about an hour.
- **Client ID:** stored in your browser's `localStorage`. It is public, not a secret, and you can remove it at any time.
- **Cached metadata (planned):** stored in IndexedDB in your browser, so that a scan can resume after a reload. It is cleared on sign-out.
- **Settings:** stored in your browser. They contain no account data.

Nothing is stored on any server operated by the project.

## What leaves your browser

Only requests to these hosts (set by the Content-Security-Policy in `vite.config.ts`):

| Host | Purpose |
|---|---|
| `https://gmail.googleapis.com` | Gmail metadata and, after your confirmation, changes to messages |
| `https://www.googleapis.com` | Drive metadata and, after your confirmation, changes to files |
| `https://accounts.google.com` | Google sign-in, and Google's sign-in script and frame |
| `https://oauth2.googleapis.com` | Token exchange used by Google's sign-in |

Google's sign-in script is loaded from `accounts.google.com`. Everything else is served from the app's own origin.

## Content-Security-Policy

Production builds include a Content-Security-Policy meta tag. In summary it:

- allows scripts only from the app's own origin and Google's sign-in script,
- allows styles, images, and fonts only from the app's own origin (plus inline style attributes and `data:` or `blob:` images, used by charts),
- allows network connections only to the hosts above,
- allows frames only from Google's sign-in host,
- blocks everything else by default (`default-src 'none'`), and
- sets `form-action 'none'`, so forms cannot submit anywhere.

The browser enforces this policy. If the app tried to contact a host not on the list, the browser would block the request and report it in the console.

## How to verify it yourself

1. **Check the policy.** Open the live app, press Ctrl+U (or Cmd+Option+U) to view the source, and find the `Content-Security-Policy` meta tag. Confirm the `connect-src` list matches the table above.
2. **Watch the network.** Open developer tools (F12), go to the **Network** tab, and sign in and scan. Every request should go to one of the hosts in the table. Filter by "Other" or look at the domain column.
3. **Check the source.** The repository is public. The rules are in [CONTRIBUTING.md](../CONTRIBUTING.md), and CI runs `npm run check:csp` to fail the build if a new host appears.
4. **Check the build.** See [verification.md](verification.md) to confirm that the deployed files were built from a specific commit.

## Deleting your data

- **Sign out** in the app. This clears in-memory tokens and, once cached data is implemented, the IndexedDB cache.
- **Clear site data** in your browser for the app's address. This removes the stored Client ID and any cached data.
- **Wipe all data (planned):** a button in Settings that removes every local record the app has created.
- **Revoke access** at https://myaccount.google.com/permissions to remove the app's permission from your Google account.
- **Delete your OAuth client** in your Google Cloud project if you no longer want it.

The project cannot delete data on your behalf because it never holds your data.

## Children, legal, and terms

The app is a tool for managing your own accounts. Use it only with accounts you are allowed to manage. The project does not knowingly process data about anyone other than the person using the app.

## Changes to this document

Changes to what the app reads or where it sends data are privacy-relevant. They must be listed in [CHANGELOG.md](../CHANGELOG.md) and reflected here before release.
