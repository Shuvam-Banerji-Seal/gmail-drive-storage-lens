# Frequently asked questions

## General

**What is Gmail Storage Lens?**
An open-source, browser-only tool that shows what is using your Gmail and Google Drive storage, lets you explore it, and helps you clean it up with a preview first.

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

## Privacy

**Does the project see my emails or files?**
No. The app runs in your browser and sends data only to Google. The project has no server to receive it.

**Does it read the contents of my emails?**
No. It reads headers, sizes, and labels. It does not download message bodies or attachments.

**Does it use analytics?**
No. There are no analytics, trackers, or third-party scripts.

**How can I check?**
Use the browser's Network tab and the Content-Security-Policy. See [[Privacy and Security|Privacy-and-Security]].

## Usage

**Will it delete anything without asking me?**
No. Cleaning defaults to Trash. Permanent deletion needs a separate confirmation.

**Will the numbers match Google's storage page?**
Not exactly. Gmail sizes are estimated from message metadata, and Google's page can take minutes to hours to update.

**Can it remove only the attachment from a message?**
No. The Gmail API cannot remove an attachment and keep the message.

**Can it analyse my Google Photos?**
No. Google removed the Photos read scopes in 2025. Photos use can only be estimated.

**Can it clean up automatically in the background?**
No. It runs only while the page is open.

**How long does a scan take?**
It depends on the size of your mailbox. The largest messages are scanned first, so you see the biggest wins early.

**Will I have to sign in again often?**
Possibly. In Testing mode, consent can expire sooner than usual.

## Project

**How can I contribute?**
See [[Contributing|Contributing]].

**Where do I report a bug?**
Use the bug report form in the repository's Issues. For security issues, follow the private process in SECURITY.md.

**What licence is it under?**
AGPL-3.0-or-later. If you run a modified version for others over a network, you must share your changes with them.
