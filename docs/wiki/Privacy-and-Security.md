# Privacy and security

Gmail Storage Lens is designed so that you do not have to trust the project with your data, because the project never receives it. This page summarises the model. The full details are in [privacy.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/privacy.md), and the checks are in [verification.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/verification.md).

## The short version

- **No server.** The app is static files. There is nowhere on our side for your data to go.
- **Your own client.** Sign-in uses an OAuth client in your own Google Cloud project. The project never sees your tokens.
- **Metadata only.** It reads headers, sizes, labels, and file metadata. It never reads message bodies or file contents.
- **Stored in your browser.** Cached data stays in your browser and is cleared on sign-out.
- **Only Google.** The only destinations are Google's APIs and sign-in endpoints.
- **No analytics.** There are no trackers, advertising, or third-party scripts.

## Enforced by the browser

The production build includes a Content-Security-Policy. It allows scripts only from the app and Google's sign-in library, and network connections only to Google's hosts. If the app tried to reach any other host, the browser would block it.

## How to check it yourself

1. Open the live site and view the page source. Find the Content-Security-Policy and confirm its connection list.
2. Open developer tools, go to the **Network** tab, sign in, and run a scan. Confirm every request goes to Google.
3. Read the [source code](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens) and the rules in [CONTRIBUTING.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/CONTRIBUTING.md).
4. Confirm a deployed build came from a specific commit using `gh attestation verify`. The steps are in [verification.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/verification.md).

## Permissions

The app asks for read-only access first, and asks for more only when you choose to clean something. Deletion goes to Trash by default. Permanent deletion needs a separate confirmation. Details are in [scopes.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/scopes.md).

## Deleting your data

- Sign out in the app.
- Clear the site data for the app's address in your browser.
- Revoke the app's access at https://myaccount.google.com/permissions.
- Delete your OAuth client in Google Cloud if you no longer need it.

## Reporting a security problem

Do not open a public issue. Use the private reporting form described in [SECURITY.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/SECURITY.md).

## Limits

A licence and open source code cannot prove what a copy hosted by someone else does. Trust the official repository, or build and host the app yourself. Google's own policies apply to the data in your account.
