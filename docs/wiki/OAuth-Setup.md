# OAuth setup

This page summarises the setup. The complete, up-to-date steps, with the exact console links and the full troubleshooting table, are in the repository at [docs/oauth-setup.md](https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/blob/main/docs/oauth-setup.md).

## Summary

1. **Create a project** at https://console.cloud.google.com/projectcreate.
2. **Enable the APIs.** Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) in that project.
3. **Configure the Google Auth Platform.**
   - **Branding:** give the app a name and your own contact email.
   - **Audience:** choose **External**, keep the status at **Testing**, and add your own Google account as a test user.
4. **Create a client.** Go to **Clients**, choose **Create client**, select **Web application**, and add the origin:
   - the live site: `https://shuvam-banerji-seal.github.io`
   - local development: `http://localhost:5173`

   Enter the origin only, with no path and no trailing slash. Leave **Authorized redirect URIs** empty.
5. **Copy the Client ID.** It ends in `.apps.googleusercontent.com`. Do not create or copy a client secret.
6. **Paste it into the app** and sign in with your test account.

## Things to know

- The "Google hasn't verified this app" screen is expected. Continue past it.
- Testing-mode consent can expire sooner than usual, so you may sign in again from time to time.
- Workspace administrators can block the Cloud project, the app, or the scopes. Ask your administrator, or use a personal account.

## If something fails

See [[Troubleshooting|Troubleshooting]] for the most common errors, including `origin_mismatch`, `access_denied`, `accessNotConfigured`, and `admin_policy_enforced`.
