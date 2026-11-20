# Set up your own Google OAuth client

Gmail Storage Lens does not come with a Google sign-in client of its own. You create a free OAuth client in your own Google Cloud project, paste its Client ID into the app, and sign in with that client. This keeps your access under your control: the project maintainers never see your tokens or your consent.

This takes about five minutes. You do not need to enter billing details, and you do not need a client secret.

> **Google changes its console often.** The names of menus and buttons below reflect the Google Cloud console at the time of writing. If a label differs, look for the same setting in the **Google Auth Platform** section. If something has moved, please open an issue with the `setup-guide` label so we can update this page.

## What you will create

| Item | Value |
|---|---|
| Google Cloud project | Any name, for example `storage-lens` |
| APIs enabled | Gmail API and Google Drive API |
| Consent screen | External audience, Testing status, your own account as a test user |
| OAuth client | Type **Web application**, with one authorized JavaScript origin |
| Result | A Client ID ending in `.apps.googleusercontent.com` |

## Step 1: Create a project

1. Open https://console.cloud.google.com/projectcreate
2. Enter a project name, for example `storage-lens`.
3. Leave the organisation or location as the default, unless you are using a Workspace account that requires a specific one.
4. Choose **Create**, then make sure the new project is selected in the project picker at the top of the page.

## Step 2: Enable the Gmail and Drive APIs

Do this for the project you just created. Each link opens the API's library page.

1. Open https://console.cloud.google.com/apis/library/gmail.googleapis.com and choose **Enable**.
2. Open https://console.cloud.google.com/apis/library/drive.googleapis.com and choose **Enable**.

If a page says the API is already enabled, you can move on.

## Step 3: Configure the Google Auth Platform

1. Open the **Google Auth Platform** section of the console (search for it in the top search bar, or use the navigation menu under **APIs & Services**).
2. If you see a prompt to get started, follow it. Otherwise, use the sections on the left:

### Branding

- **App name:** `Gmail Storage Lens` (or any name you like for your own use)
- **User support email:** choose your own email address from the drop-down
- **Developer contact information:** your own email address

Choose **Save**. These details are shown on the sign-in screen only to you.

### Audience

- Select **External**.
- Under **Test users**, choose **Add users** and enter the Google account you will use with the app. Add only accounts you control.
- Keep the publishing status at **Testing**. Do not publish the app. You do not need Google's verification process for your own use.

### Data access

- You may leave the scopes empty. The app requests its scopes when you sign in, and it asks for broader access only when you choose to clean something.

## Step 4: Create the OAuth client

1. In the left menu, choose **Clients**, then **Create client**.
2. **Application type:** choose **Web application**.
3. **Name:** for example `Storage Lens web`.
4. **Authorized JavaScript origins:** choose **Add URI** and enter the origin for where you will open the app:

   | Where you run the app | Origin to enter |
   |---|---|
   | The live site | `https://shuvam-banerji-seal.github.io` |
   | Your own fork on GitHub Pages | `https://YOUR-GITHUB-USERNAME.github.io` |
   | Local development (`npm run dev`) | `http://localhost:5173` |

   Enter the **origin only**: scheme, host, and port if there is one. Do not add a path such as `/gmail-drive-storage-lens/`, and do not add a trailing slash. If you use more than one place, add each origin as a separate entry.

5. **Authorized redirect URIs:** leave this empty. The app uses the browser token flow, which does not need a redirect URI.
6. Choose **Create**.
7. Copy the **Client ID**. It looks like `123456789-abc...apps.googleusercontent.com`.

**Do not create or copy a client secret.** This app never needs one. If a step asks for a secret for this app, stop and check that you are on the right screen.

## Step 5: Connect the app

1. Open the app (the live site, or `http://localhost:5173` for development).
2. Paste the Client ID into the setup field.
3. Sign in with the Google account you added as a test user.
4. When Google asks for permissions, read them and accept only if you are comfortable with them. See [scopes.md](scopes.md) for what each permission is used for.

## Testing-mode notes

- **"Google hasn't verified this app."** This warning is expected for your own app in Testing mode. Choose the option to continue (you may need to expand **Advanced** first), then accept the permissions. The wording and button placement can vary.
- **Expiry.** Apps in Testing mode can have consent expire sooner than usual. The app uses the browser token flow without refresh tokens, so you may simply need to sign in again when a session ends.
- **Test users.** Only the accounts you added as test users can sign in. Add yourself before you try.
- **Workspace accounts.** If your account belongs to an organisation (a school, institute, or company Google Workspace), the administrator may block third-party apps, block creating Cloud projects, or restrict the Gmail and Drive scopes. In that case you cannot complete the setup yourself. Ask the administrator, or use a personal Google account.

## Troubleshooting

| What you see | Likely cause | What to do |
|---|---|---|
| `Error 400: origin_mismatch` | The page's origin is not in **Authorized JavaScript origins** | Add the exact origin shown in the error (scheme, host, and port), with no path, and wait a few minutes for the change to apply. Check you did not add a trailing slash. |
| `redirect_uri_mismatch` | A redirect URI is being requested that your client does not list | This app does not use redirect URIs. Check you chose **Web application**, and that you did not change the flow. Recreate the client if unsure. |
| `access_denied`, or "Access blocked" for your account | Your account is not a test user | Add the account under **Audience** > **Test users**, then sign in again. |
| `403 accessNotConfigured`, or "API has not been used in project ... or it is disabled" | The Gmail or Drive API is not enabled in this project | Enable the API from Step 2 for the same project that holds your client, then wait a minute and retry. |
| `admin_policy_enforced`, or "Your administrator has blocked access" | A Workspace administrator restricts third-party apps or these scopes | Ask your administrator, or sign in with a personal account. |
| Sign-in popup closes immediately, or nothing happens | The browser blocked the popup | Allow popups for the site in your browser's address-bar settings, then try again. |
| "Client ID format is not recognised" | The value is not a Web client ID | Copy the Client ID (it ends in `.apps.googleusercontent.com`), not the project number or the client secret. |
| Asked for a client secret | You are on the wrong screen, or the client type is wrong | Stop. This app never needs a client secret. Check the client is type **Web application**. |

If your problem is not listed, open an issue with the `setup-guide` label and include the exact error text with personal details removed (never your Client ID, tokens, or email address).

## Removing access later

- To revoke the app's access to your account, visit https://myaccount.google.com/permissions and remove the app.
- To delete the client, open the **Clients** page in your Google Cloud project and delete it. This stops the app from signing in with it.
- To remove the Client ID from the app, use sign-out or clear the site data in your browser.
