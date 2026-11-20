# Privacy

This document describes what Gmail Storage Lens reads, where it is stored, what leaves your browser, and how to delete it. It also explains how you can check these claims yourself.

## Summary

- The app runs entirely in your browser as static files. There is no server that receives your data.
- It reads **metadata only** by default: message headers, sizes, labels, and Drive file metadata. Message content is read only in the two opt-in cases described in [When content is read](#when-content-is-read).
- Your session lives in memory. A scan is saved in your browser only if you choose to save it, and then it is **encrypted with your passphrase**. Wipe this device removes everything the app stored.
- The only network destinations are **Google's own APIs and sign-in endpoints**. The browser enforces this with a Content-Security-Policy.
- The project has **no analytics, no tracking, no advertising, and no third-party scripts** other than Google's sign-in library. Fonts are bundled with the app.

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

The app asks Gmail for the following fields of each message. By default it never requests message bodies.

- Headers: `From`, `To`, `Cc`, `Subject`, `Date`, `List-Id`, `List-Unsubscribe`, and thread and message identifiers
- `sizeEstimate`: the approximate size of the message in bytes
- `labelIds`: the labels on the message, such as Inbox, Starred, or categories
- Counts per label, from the label summaries
- Gmail history identifiers, so that "Sync changes" can fetch only what changed

Gmail does not offer a per-user storage total, so the app sums the sizes of messages it reads.

### Drive (metadata)

- File identifiers, names, MIME types, sizes, checksums (`md5Checksum` and similar), parent folders, modified and viewed times, ownership, sharing flags, and trashed status
- Quota figures from Drive's storage summary
- Revision sizes, for files where the app checks for old versions
- A Drive change token, so that "Sync changes" can fetch only what changed

The app does not download Drive file contents.

### What it never reads

- Message bodies, except in the opt-in archive download described below
- Attachment contents
- File contents, including Google Docs, Sheets, and Slides text
- Contacts, calendar, photos, or any other Google service

## When content is read

Message content is read in exactly two cases, and each one starts only when you press its button. No other feature requests message bodies or attachment data. The repository's network check (`scripts/check-network.mjs`) fails the build if a body or raw-format request appears anywhere else.

1. **Attachment structure scan (optional, Gmail Attachments tab).** The app requests each message's MIME structure with a fields mask. The response contains part names, types, and sizes. The mask excludes the body data, so attachment contents and message text are not transferred.
2. **Archive download (Airlock, "Download archive (.mbox)").** For the emails you have selected, the app requests each full raw message and combines them into one `.mbox` file. The file is saved straight to your device by the browser. The app does not upload it, and it does not keep a copy. The file then contains the full content of those emails, so store it with the same care as your mail.

## Where data is stored

| Data | Where | How long |
|---|---|---|
| Access token | Memory only, for the current session. Never written to `localStorage` or any other storage. Expires after about an hour. | Until sign-out, expiry, or closing the page |
| Client ID and preferences (theme, storage cap, tour state) | Your browser's `localStorage`. The Client ID is public, not a secret. | Until Wipe this device, or until you clear site data |
| Saved scan (optional) | IndexedDB in your browser, encrypted. The key is derived from your passphrase with PBKDF2-SHA-256 (310,000 iterations) and used with AES-256-GCM. It holds the metadata from the scan (identifiers, senders, subjects, sizes, labels, file metadata) and sync markers. It holds no OAuth token. | Until you Wipe this device, or clear site data |

The app saves a scan only when you choose **Save scan** and enter a passphrase of at least eight characters. Nothing is saved automatically. Without the passphrase, the saved data cannot be read. If you forget it, the saved scan cannot be recovered, so you would need to Wipe and scan again.

Nothing is stored on any server operated by the project.

## What leaves your browser

Only requests to these hosts (set by the Content-Security-Policy in `vite.config.ts`):

| Host | Purpose |
|---|---|
| `https://gmail.googleapis.com` | Gmail metadata and, after your confirmation, changes to messages |
| `https://www.googleapis.com` | Drive metadata and, after your confirmation, changes to files |
| `https://accounts.google.com` | Google sign-in, and Google's sign-in script and frame |
| `https://oauth2.googleapis.com` | Token exchange used by Google's sign-in |

Google's sign-in script is loaded from `accounts.google.com`. Everything else, including fonts, is served from the app's own origin. The `.mbox` archive is written to your device by the browser and does not leave it through the app.

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

1. **Use the Verify privacy page.** The app's **Verify privacy** page shows every request this tab has made, grouped by destination. It also shows the policy the browser is enforcing, and it probes a non-Google host to confirm the policy blocks it.
2. **Check the policy.** Open the live app, press Ctrl+U (or Cmd+Option+U) to view the source, and find the `Content-Security-Policy` meta tag. Confirm the `connect-src` list matches the table above.
3. **Watch the network.** Open developer tools (F12), go to the **Network** tab, and sign in and scan. Every request should go to one of the hosts in the table. Filter by "Other" or look at the domain column.
4. **Check the source.** The repository is public. The rules are in [CONTRIBUTING.md](../CONTRIBUTING.md), and CI runs `npm run check:csp` to fail the build if a new host appears.
5. **Check the build.** See [verification.md](verification.md) to confirm that the deployed files were built from a specific commit.

## Deleting your data

- **Sign out** in the app. This clears the in-memory token and session. It does not delete a saved scan.
- **Wipe this device** in **Settings**. Type `WIPE` to confirm. This signs you out, revokes the token, deletes every saved scan, and forgets your Client ID and preferences.
- **Clear site data** in your browser for the app's address. This removes the Client ID, preferences, and any saved scan.
- **Delete a `.mbox` archive** from your Downloads folder, if you saved one. The app cannot reach it after the download.
- **Revoke access** at https://myaccount.google.com/permissions to remove the app's permission from your Google account.
- **Delete your OAuth client** in your Google Cloud project if you no longer want it.

The project cannot delete data on your behalf because it never holds your data.

## Children, legal, and terms

The app is a tool for managing your own accounts. Use it only with accounts you are allowed to manage. The project does not knowingly process data about anyone other than the person using the app.

## Changes to this document

Changes to what the app reads or where it sends data are privacy-relevant. They must be listed in [CHANGELOG.md](../CHANGELOG.md) and reflected here before release.
