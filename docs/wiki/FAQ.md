# Frequently asked questions

## General

**What is Gmail Storage Lens?**
An open-source, browser-only tool that shows what is using your Gmail and Google Drive storage, lets you explore it, and helps you clean it up with a preview first.

**Can I try it without an account?**
Yes. Choose **Explore the demo** on the landing page. The demo uses synthetic data and does not contact Google.

**Is it free?**
Yes. The project is free software, and using it costs nothing. Google's APIs are free for personal use at the volumes this app needs.

**Is it an official Google product?**
No. It is an independent project, not affiliated with or endorsed by Google. Gmail and Google Drive are trademarks of Google LLC.

**Does it have a server or an account system?**
No. It is static files in your browser. There are no accounts on our side.

**Which browsers work?**
Recent versions of Firefox, Chrome, Edge, and Safari.

## Setup

**Why do I need my own Google Cloud project?**
Gmail and broad Drive access are restricted scopes. Google requires a verification process and a security assessment before a public app can use them. Creating your own client avoids that, and keeps your credentials under your control.

**Do I need to pay for Google Cloud?**
No. You do not need to enable billing for the Gmail and Drive APIs at this scale.

**Do I need a client secret?**
No. Never create or paste one for this app.

**Can I use a Workspace (work or school) account?**
Often yes, but your administrator may block third-party apps or Cloud project creation. If so, use a personal account.

**Why does Google say the app is unverified?**
Because it is your own app in Testing mode. Continue past the warning.

**What does the connection test check?**
Sign-in, Drive access, and Gmail access. Each failed check shows a plain-language explanation and the fix.

## Privacy

**Does the project see my emails or files?**
No. The app runs in your browser and sends data only to Google. The project has no server to receive it.

**Does it read the contents of my emails?**
Not by default. It reads headers, sizes, and labels. Message content is read only when you start the attachment structure scan (names and sizes only) or download a `.mbox` archive of selected emails.

**Does it save my scan?**
Only if you choose **Save scan** and enter a passphrase. The saved scan is encrypted on your device. Wipe this device deletes it.

**Does it use analytics?**
No. There are no analytics, trackers, or third-party scripts.

**How can I check?**
Open the **Verify privacy** page in the app, or use the browser's Network tab and the Content-Security-Policy. See [[Privacy and Security|Privacy-and-Security]].

## Usage

**Will it delete anything without asking me?**
No. Cleaning defaults to Trash. Permanent deletion, and emptying Trash or Spam, need a typed confirmation.

**Will the numbers match Google's storage page?**
Not exactly. Gmail sizes are estimated from message metadata, and Google's page can take minutes to hours to update.

**Can it remove only the attachment from a message?**
No. The Gmail API cannot remove an attachment and keep the message. You can download a `.mbox` archive of the selected emails first, then move them to Trash.

**Can it analyse my Google Photos?**
No. Google removed the Photos read scopes in 2025. Photos use can only be estimated.

**Can it clean up automatically in the background?**
No. It runs only while the page is open. A Gmail filter, created from the Airlock, is the closest substitute.

**How long does a scan take?**
It depends on the size of your mailbox. The largest messages are scanned first, so you see the biggest wins early.

**Can I update a scan without starting over?**
Yes. Choose **Sync changes** to fetch only what changed since the last scan.

**Will I have to sign in again often?**
Possibly. In Testing mode, consent can expire sooner than usual.

## Project

**How can I contribute?**
See [[Contributing|Contributing]].

**Where do I report a bug?**
Use the bug report form in the repository's Issues. For security issues, follow the private process in SECURITY.md.

**What licence is it under?**
AGPL-3.0-or-later. If you run a modified version for others over a network, you must share your changes with them.
