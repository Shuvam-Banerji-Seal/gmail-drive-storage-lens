# Troubleshooting

Start with the **connection test** in the setup wizard. It checks sign-in, Drive, and Gmail access, and shows a fix for each failed check. Then find your error below. The complete table, with extra detail, is in [docs/oauth-setup.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/oauth-setup.md#troubleshooting).

## Setup and sign-in errors

### "Client ID not recognised"

- Copy the Client ID again from the Google Cloud console, under **Clients**. It ends in `.apps.googleusercontent.com`.
- Do not use the project number or the client secret.

### `Error 400: origin_mismatch` (or `redirect_uri_mismatch`)

The address you opened the app from is not listed as an **Authorized JavaScript origin** on your OAuth client.

- Copy the origin from the error, or use `https://YOUR-USERNAME.github.io` for a Pages deployment, or `http://localhost:5173` for development.
- Enter the origin only: no path, no trailing slash.
- Wait a few minutes after saving, then try again.

### `access_denied` or "Access blocked"

Your Google account is not a test user for the app.

- In the Google console, open **Audience**, add your account under **Test users**, and sign in again.

### `403 accessNotConfigured`, or "API has not been used in project"

The Gmail or Drive API is not enabled in the project that holds your client.

- Enable both APIs from the library pages in [[OAuth Setup|OAuth-Setup]], in the same project.
- Wait a minute, then retry.

### `admin_policy_enforced` or "Your administrator has blocked access"

A Workspace administrator restricts third-party apps or these scopes.

- Ask your administrator, or sign in with a personal Google account.

### Sign-in popup closes or does nothing

Your browser blocked the popup.

- Allow popups for the site in the browser's address-bar or site settings, then try again.

### Asked for a client secret

- Stop. This app never needs a client secret. Check that your client is type **Web application** and that you copied the Client ID, which ends in `.apps.googleusercontent.com`.

### "Google hasn't verified this app"

- This is expected for your own app in Testing mode. Continue past the warning.

## Scanning and syncing

### A scan stops or slows down

Google limits how many requests one account can make per second. The app pauses and retries when this happens. Large mailboxes take longer. Let the scan continue. To stop and pick up later, choose **Save scan** in Settings and enter a passphrase. Later, use **Load scan** with the same passphrase, then **Sync changes**.

### "Wrong passphrase or corrupted data" when loading a scan

- Check the passphrase. It is case-sensitive.
- If you forgot it, the saved scan cannot be recovered. Scan again, and save with a passphrase you will remember.

### Sync changes runs a full scan

If Gmail's history marker has expired, the app cannot fetch only the changes, so it rescans. This is expected after a long gap.

### The numbers do not match Google's storage page

- Gmail sizes are estimates from message metadata.
- Google's storage page can take minutes to hours to update after a change.
- Items in Trash still count toward your quota until Trash is emptied.

### Signed out unexpectedly

- Access tokens expire after about an hour, and Testing-mode consent can expire sooner. Sign in again.

## Cleaning

### A cleanup action is missing or asks for permission

- Each cleaning action asks for its own Google permission the first time you use it. If you decline, that action does not run, and you can try again later.
- Permanent deletion and emptying Trash or Spam need the exact typed phrase, such as `DELETE 299` or `EMPTY SPAM`.

### I moved something to Trash by mistake

- Use **Undo** in the notification, if it is still on screen.
- Otherwise open Gmail or Drive Trash and restore the item. Trash keeps items for 30 days.

## Browser and display

### Charts do not show, or the page looks broken

- Use a recent browser version.
- Turn off extensions that change page content, then reload.
- Try a private window.

### A browser extension is blocking something

- Extensions that rewrite pages, block scripts, or change headers can break the app. Test in a private window with extensions disabled.

## Still stuck?

- Search [Discussions](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/discussions).
- Open a bug report with the steps you took and the exact error text, with personal details removed. Never include your Client ID, tokens, email addresses, or message contents.
