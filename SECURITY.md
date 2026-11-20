# Security Policy

Gmail Storage Lens works with private account data, so we take security reports seriously. Thank you for taking the time to report responsibly.

## Supported versions

| Version | Supported |
|---|---|
| `main` branch and the live GitHub Pages deployment | Yes |
| 0.1.x | Yes (latest release) |
| Older builds and forks | No. Update to the latest release or rebuild from `main`. |

## Reporting a vulnerability

**Please do not report security issues in public issues, pull requests, or Discussions.**

Use GitHub's private vulnerability reporting instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** (or open the form directly at https://github.com/Shuvam-Banerji-Seal/gmail-drive-storage-lens/security/advisories/new).
3. Describe the problem, the steps to reproduce it, the affected version or commit, and the impact you expect.

Only repository maintainers can see the report. We will confirm receipt as soon as we can, usually within a week, and keep you updated while we investigate. If the report is accepted, we will work on a fix in a private advisory, agree a disclosure date with you, and credit you in the release notes unless you prefer to stay anonymous.

If you are unsure whether something is a security issue, report it privately anyway. We would rather triage a false alarm than miss a real problem.

## Scope

**In scope:**

- The application code in this repository (`src/`, the build configuration, and the workflows in `.github/`).
- The published GitHub Pages deployment of this repository.
- Anything that could expose a user's tokens, message contents, file contents, or metadata beyond what the app is designed to read.
- Content Security Policy bypasses, cross-site scripting, and any path that sends data to a host outside the allowlist.
- Supply-chain issues: compromised dependencies, workflow misconfiguration, or build outputs that do not match the source.

**Out of scope:**

- Security problems in Google's own services (Gmail, Drive, Google Identity). Report those to Google through its vulnerability reward programme.
- Forks and copies hosted by other people. Report issues there to the person who runs them.
- Problems that require a user to install a malicious browser extension or to run modified code on their own machine.
- Social engineering, denial-of-service against GitHub Pages, and automated scanner output without a demonstrated impact.
- Missing features and documentation gaps, which are better handled as normal issues.

## Threat model summary

- **No backend.** The project operates no server that receives user data. There are no API keys or secrets in the repository.
- **Bring your own client.** Each user creates an OAuth Web client in their own Google Cloud project. The client ID is public. No client secret is used, and no refresh tokens are stored.
- **Tokens stay in the browser.** Access tokens are kept in memory and are not written to `localStorage`. They expire after about an hour.
- **Metadata only.** The app requests headers, sizes, labels, and file metadata. It never downloads message bodies or file contents.
- **Restricted network.** A strict Content-Security-Policy limits the app to Google's API and sign-in hosts. CI fails if the policy is loosened or a new host appears in the source.
- **No third-party runtime code.** The only external script is Google's sign-in library. There are no analytics, CDNs, or remote fonts.
- **Destructive actions are gated.** Cleanup defaults to Trash. Permanent deletion needs a separate, typed confirmation.
- **Verifiable builds.** Deployments are built by GitHub Actions and carry build provenance attestations. See [docs/verification.md](docs/verification.md).

The main risks we keep in view are: a compromised dependency, a malicious fork that a user mistakes for the official site, a user pasting a client secret or token somewhere it should not go, and a browser extension that reads page content. The guide tells users how to recognise an official deployment and what the app should never ask for.

## Safe harbour

We will not pursue action against researchers who make a good-faith effort to follow this policy, avoid privacy violations and service disruption, use only their own accounts and data, and report findings privately. Please do not access or retain other people's data.

## Hardening your own copy

If you run your own deployment:

- Keep the Content-Security-Policy in `vite.config.ts` in place.
- Use your own OAuth client, restricted to your own origin.
- Keep Dependabot and CodeQL enabled, and deploy only from commits you have reviewed.
