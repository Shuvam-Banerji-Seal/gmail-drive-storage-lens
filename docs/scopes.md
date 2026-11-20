# Permissions (OAuth scopes)

Gmail Storage Lens asks Google for permissions in stages. It starts with read-only access and requests more only when you choose an action that needs it. This page lists each permission, what it is used for, and what the app deliberately does not do with it.

Google's scope names and their descriptions can change. Check the current list in Google's documentation if anything here differs from the consent screen you see.

## The scopes

| Stage | Scope | Used for | Status |
|---|---|---|---|
| Sign-in and explore | `https://www.googleapis.com/auth/gmail.readonly` | Reading message headers, sizes, and labels for the Gmail views, and incremental sync through Gmail history | Available |
| Sign-in and explore | `https://www.googleapis.com/auth/drive.metadata.readonly` | Reading Drive quota and file metadata (names, sizes, checksums, folders, times), and incremental sync through Drive changes | Available |
| Clean Gmail | `https://www.googleapis.com/auth/gmail.modify` | Moving selected messages to Trash, untrashing them for Undo, and adding the "Storage Lens/Review" label to selected messages | Available |
| Clean Gmail, permanently | `https://mail.google.com/` | Permanently deleting selected messages, and emptying Gmail Trash or Spam. Requested only after an explicit choice. | Available |
| Filters | `https://www.googleapis.com/auth/gmail.settings.basic` | Creating a Gmail filter you have reviewed | Available |
| Clean Drive | `https://www.googleapis.com/auth/drive` | Moving Drive files to Trash, restoring them, deleting selected old revisions, and emptying Drive Trash | Available |

The app does not request `https://www.googleapis.com/auth/gmail.labels`. The review label is created and applied under `gmail.modify`.

## Why the first scopes are read-only

The explore stage needs to know what is using space, not what the messages say. The app therefore:

- asks Gmail only for headers and sizes by default, never bodies,
- asks Drive only for metadata, never file contents, and
- never writes anything during the explore stage.

## What the read-only scope still allows

Be aware that `gmail.readonly` is broader than what the app uses. Google's `gmail.readonly` permission would technically allow reading full message content. By default the app's code requests metadata only, and CI and code review enforce that rule. There are two opt-in cases where message content is read, both listed in [privacy.md](privacy.md#when-content-is-read): the attachment structure scan (structure only, no bodies) and the `.mbox` archive download of selected emails. Because the browser cannot enforce which fields a program asks for, you should rely on the open-source code and your own checks rather than on the scope name alone.

The `gmail.metadata` scope is narrower, but at the time of writing it does not support the search query parameter the app needs for tiered scans. The app may move to it later if that changes.

## Incremental consent

Google shows a permission prompt the first time an app asks for a scope. Gmail Storage Lens uses this to keep the first sign-in small:

1. **Sign in and explore.** You are asked for read-only scopes only.
2. **Choose to clean.** The app explains what the next step will change, then asks for the broader scope. Each action asks only for the scope it needs.
3. **Decline.** If you decline, the app stays read-only and the cleaning action does not run.

## Trash versus permanent deletion

| Action | What happens | Recoverable? |
|---|---|---|
| Move to Trash (Gmail, default) | The message moves to Trash, which Gmail empties automatically after 30 days. An Undo option is offered for the current session. | Yes, from Trash, for a limited time |
| Move to Trash (Drive, default) | The file moves to Drive's Trash, which keeps items for 30 days | Yes, from Trash, for a limited time |
| Permanent delete (Gmail) | The message is removed without going through Trash | No, not from Gmail |
| Empty Gmail Trash or Spam | Every message in that folder is removed for good | No |
| Empty Trash (Drive) | Files in Trash are removed for good | No |
| Prune old revisions (Drive) | Revisions you pinned with "keep forever" are deleted. The current version is never touched. | No |

Storage from items in Trash can still count toward your quota until Trash is emptied. The app shows Trash sizes separately so you can see this.

Permanent operations require a separate confirmation in which you type the number of items, for example `DELETE 299`. Emptying Drive Trash requires you to type `EMPTY TRASH`, and emptying Gmail Trash or Spam requires `EMPTY GMAIL TRASH` or `EMPTY SPAM`.

## What the app will never do with these permissions

- Send email or drafts.
- Change message contents, labels you did not choose, or sharing settings.
- Read or share files with anyone else.
- Access accounts other than the one you signed in with.
- Keep a copy of your tokens anywhere outside your browser's memory.

## Revoking permissions

Remove the app at https://myaccount.google.com/permissions at any time. The app will then need to ask again when you sign in.
