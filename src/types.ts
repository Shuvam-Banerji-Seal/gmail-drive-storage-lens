// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared data contracts. Only metadata is ever modelled: no message bodies, no file contents.

export interface GmailMsg {
  id: string
  threadId: string
  /** Gmail's sizeEstimate in bytes (approximate). */
  size: number
  /** Raw From header. */
  from: string
  fromName: string
  /** Lower-cased address. */
  fromEmail: string
  /** Lower-cased domain of fromEmail. */
  domain: string
  /** Lower-cased To+Cc addresses. */
  recipients: string[]
  subject: string
  /** internalDate in epoch ms. */
  ts: number
  labels: string[]
  /** List-Id header value, if any. */
  listId?: string
  /** Raw List-Unsubscribe header, if any. */
  listUnsub?: string
}

export interface DriveFile {
  id: string
  name: string
  mime: string
  /** Bytes of the head blob (0 for folders / native Google docs without size). */
  size: number
  /** quotaBytesUsed: head revision plus revisions kept forever. */
  quota: number
  md5?: string
  sha256?: string
  parents: string[]
  owned: boolean
  shared: boolean
  trashed: boolean
  /** viewedByMeTime epoch ms, undefined if never. */
  viewed?: number
  modified: number
  created: number
  ownerEmails: string[]
  /** True if any permission has type "anyone". */
  publicLink: boolean
  isFolder: boolean
}

export interface QuotaInfo {
  /** Bytes; undefined for unlimited. */
  limit?: number
  usage: number
  usageInDrive: number
  usageInTrash: number
  email?: string
}

export type Risk = 'blocked' | 'high' | 'medium' | 'low'

export interface SafetyResult {
  /** 0 (safe to delete) .. 100 (risky). */
  score: number
  level: Risk
  reasons: string[]
}

export interface Cluster {
  id: string
  label: string
  kind: 'list' | 'sender' | 'subject'
  messageIds: string[]
  bytes: number
}

export type ItemKind = 'gmail' | 'drive'

export interface BasketItem {
  kind: ItemKind
  id: string
  bytes: number
  label: string
}

export type ScanPhase = 'idle' | 'listing' | 'fetching' | 'done' | 'error' | 'cancelled'

export interface ScanProgress {
  phase: ScanPhase
  done: number
  total: number
  bytesSeen: number
  message?: string
}

/** Scope tiers. The app starts read-only and upgrades only when the user cleans. */
export const SCOPES = {
  driveRead: 'https://www.googleapis.com/auth/drive.metadata.readonly',
  gmailRead: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailLabels: 'https://www.googleapis.com/auth/gmail.labels',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  gmailSettings: 'https://www.googleapis.com/auth/gmail.settings.basic',
  gmailFull: 'https://mail.google.com/',
  driveFull: 'https://www.googleapis.com/auth/drive',
} as const
export type ScopeKey = keyof typeof SCOPES

/** Subset of the Gmail API message resource we request (format=metadata). */
export interface GmailRawMessage {
  id: string
  threadId: string
  labelIds?: string[]
  sizeEstimate?: number
  internalDate?: string
  payload?: { headers?: Array<{ name: string; value: string }> }
}

/** Subset of the Drive API file resource we request. */
export interface DriveRawFile {
  id: string
  name?: string
  mimeType?: string
  size?: string
  quotaBytesUsed?: string
  md5Checksum?: string
  sha256Checksum?: string
  parents?: string[]
  ownedByMe?: boolean
  shared?: boolean
  trashed?: boolean
  viewedByMeTime?: string
  modifiedTime?: string
  createdTime?: string
  owners?: Array<{ emailAddress?: string }>
  permissions?: Array<{ type?: string; role?: string; emailAddress?: string }>
}

export interface TreeNode {
  id: string
  name: string
  value: number
  children?: TreeNode[]
}

export interface GraphNode {
  id: string
  label: string
  value: number
  group?: number
}
export interface GraphLink {
  source: string
  target: string
  weight: number
}
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}
