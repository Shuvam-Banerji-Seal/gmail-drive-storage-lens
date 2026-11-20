# Verify the app

You do not need to trust the project's word for what the app does. This page explains how to check the deployed site, how to confirm that a build came from a specific commit, and how the network rules are enforced.

## 0. Use the Verify privacy page in the app

The **Verify privacy** page is the quickest check. It shows:

- **Network map:** every request this tab has made, by destination, with a probe that tries to reach a non-Google host. The policy should block it.
- **Enforced policy:** the Content-Security-Policy the browser is enforcing right now. Its `connect-src` is the network allowlist.
- **Build provenance:** the commit the page was built from, with a link to the source and the `gh attestation verify` command.
- **What is stored on this device:** the local records the app keeps, and how to remove them.

The sections below show how to check the same things outside the app.

## 1. Check the Content-Security-Policy in the live page

The production build injects a Content-Security-Policy meta tag into the page.

1. Open the live site.
2. View the page source (Ctrl+U on Windows and Linux, Cmd+Option+U on macOS).
3. Find the `<meta http-equiv="Content-Security-Policy">` tag.
4. Confirm that `connect-src` lists only:
   - `https://www.googleapis.com`
   - `https://gmail.googleapis.com`
   - `https://accounts.google.com`
   - `https://oauth2.googleapis.com`

`script-src` should allow only `'self'` and `https://accounts.google.com/gsi/client`.

From a terminal, you can fetch the page and search for the tag:

```bash
curl -sSL https://shuvam-banerji-seal.github.io/gmail-drive-storage-lens/ | grep -o 'Content-Security-Policy[^>]*'
```

## 2. Watch the requests

1. Open developer tools (F12) and go to the **Network** tab.
2. Reload the page and sign in.
3. Run a scan.
4. Check that every request goes to one of the hosts above, or to the app's own files.

Anything else would be a bug or a policy violation, and should be reported under [SECURITY.md](../SECURITY.md).

## 3. Confirm a deployed build matches a commit

Each deployment is built by the **Deploy to GitHub Pages** workflow and receives a build provenance attestation for `dist/index.html` and the files in `dist/assets/`. You can check these attestations with the GitHub CLI.

### Requirements

- The [GitHub CLI](https://cli.github.com/) (`gh`), version 2.49 or newer, which includes `gh attestation`.
- Read access to the repository (public repositories need no special permission).

### Steps

1. Download the file you want to check from the live site:

   ```bash
   mkdir storage-lens-check   # any empty directory you choose
   cd storage-lens-check
   curl -sSLO https://shuvam-banerji-seal.github.io/gmail-drive-storage-lens/index.html
   ```

2. Verify its attestation against the repository:

   ```bash
   gh attestation verify index.html --repo Shuvam-Banerji-Seal/gmail-drive-storage-lens
   ```

   A successful check reports that the attestation was verified and names the repository and workflow that produced it.

3. To check a specific commit, look at the attestation's details (or the workflow run for the deployment) and confirm the commit SHA matches the one you expect. The build embeds the commit SHA in the `VITE_COMMIT` value, so you can also compare it with the commit shown in the Build provenance section of the app's **Verify privacy** page.

4. To check an asset, download it the same way from `assets/` and run `gh attestation verify` on it.

If verification fails, do not trust that copy of the site. Build the repository yourself (see below) instead.

### Note on forks

An attestation proves that a file was built by the named repository's workflow. A fork hosted by someone else has its own repository name. Verify against the fork's repository name, and only trust a fork you have chosen to trust.

## 4. Build it yourself

You can build from source and compare the output with the live site, or run your own copy.

```bash
git clone https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens.git
cd gmail-drive-storage-lens
git checkout <commit-you-want-to-check>
npm ci
npm run build
```

Production builds are written to `dist/`. Because the build embeds the commit SHA when it runs in the workflow, a local build will not match the deployed files byte for byte unless you set `VITE_COMMIT` to the same value and use the same Node.js version. Compare the behaviour and the Content-Security-Policy, and use the attestation check for byte-level trust.

To run your own copy:

```bash
npm run dev
```

Then open `http://localhost:5173`. See [oauth-setup.md](oauth-setup.md) for the OAuth origin to register.

## 5. Check the network rules in source

The repository includes a script that fails if the source references a network host outside the allowlist, or if the Content-Security-Policy is weakened:

```bash
npm run check:csp
```

CI runs this on every pull request and every push to `main`.

## 6. Check dependency licences

```bash
npm run check:licenses
```

This fails if a dependency uses a licence that is not compatible with AGPL-3.0-or-later. CI runs it too.

## 7. Check a real account (read-only)

Maintainers and contributors can run a read-only check against a real account with `scripts/live-check.ts`. It sends only GET requests and refuses any other method. Supply short-lived access tokens from your own OAuth client:

```bash
GMAIL_TOKEN=... DRIVE_TOKEN=... npm run live-check
```

Never paste tokens into issues, pull requests, or logs.

## What verification does not prove

- It does not prove that the code is free of bugs or security flaws. Report suspected problems under [SECURITY.md](../SECURITY.md).
- It does not prove what a fork or copy does.
- It does not prove what Google does with the data your account holds. Google's own policies apply to that.
