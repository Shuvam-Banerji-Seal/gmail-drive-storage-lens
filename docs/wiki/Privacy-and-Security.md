# Privacy and security

Gmail Storage Lens is designed so that you do not have to trust the project with your data, because the project never receives it. This page summarises the model. The full details are in [privacy.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/privacy.md), and the checks are in [verification.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/verification.md).

## The short version

- **No server.** The app is static files. There is nowhere on our side for your data to go.
- **Your own client.** Sign-in uses an OAuth client in your own Google Cloud project. The project never sees your tokens.
- **Metadata by default.** It reads headers, sizes, labels, and file metadata. Message content is read only when you choose one of two features: the optional attachment structure scan (which excludes body data), or the `.mbox` archive download.
- **Your session stays in memory.** Sign-out clears it. A scan is saved in your browser only if you choose to save it, and then it is encrypted with your passphrase.
- **Only Google.** The only destinations are Google's APIs and sign-in endpoints.
- **No analytics.** There are no trackers, advertising, or third-party scripts. Fonts are bundled with the app.

## Enforced by the browser

The production build includes a Content-Security-Policy. It allows scripts only from the app and Google's sign-in library, and network connections only to Google's hosts. If the app tried to reach any other host, the browser would block it.

## How to check it yourself

1. Open the **Verify privacy** page in the app. It lists every request this tab has made, probes a non-Google host, and shows the policy the browser is enforcing.
2. Open the live site and view the page source. Find the Content-Security-Policy and confirm its connection list.
3. Open developer tools, go to the **Network** tab, sign in, and run a scan. Confirm every request goes to Google.
4. Read the [source code](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens) and the rules in [CONTRIBUTING.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/CONTRIBUTING.md).
5. Confirm a deployed build came from a specific commit using `gh attestation verify`. The steps are in [verification.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/verification.md).

## When content is read

Message content is read in exactly two cases, and each starts only when you press its button:

1. **Attachment structure scan.** Reads names, types, and sizes of attachments. The request excludes body data, so message text and attachment contents are not transferred.
2. **Archive download (`.mbox`).** For the emails you select, the full messages are saved as one file straight to your device. The app does not upload or keep that file.

Every other feature reads headers, sizes, labels, and file metadata only.

## Saved scans and wiping

- **Save scan** writes the scan's metadata to your browser's storage, encrypted with AES-256-GCM. The key comes from your passphrase (PBKDF2, 310,000 iterations). Without the passphrase the data cannot be read, and a forgotten passphrase cannot be recovered.
- **Sign out** clears the session from memory. It does not delete a saved scan.
- **Wipe this device** in Settings deletes every saved scan, signs you out, revokes the token, and forgets your Client ID and preferences. Type `WIPE` to confirm.

## Permissions

The app asks for read-only access first, and asks for more only when you choose a cleaning action. Deletion goes to Trash by default. Permanent deletion needs a separate, typed confirmation. Details are in [scopes.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/scopes.md).

Starred, sent, and draft mail, and mail you sent, is blocked from deletion.

## Deleting your data

- Wipe this device in Settings (recommended).
- Sign out in the app.
- Clear the site data for the app's address in your browser.
- Revoke the app's access at https://myaccount.google.com/permissions.
- Delete your OAuth client in Google Cloud if you no longer need it.

## Reporting a security problem

Do not open a public issue. Use the private reporting form described in [SECURITY.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/SECURITY.md).

## Limits

A licence and open source code cannot prove what a copy hosted by someone else does. Trust the official repository, or build and host the app yourself. Google's own policies apply to the data in your account.
