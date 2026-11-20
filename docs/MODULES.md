# Module APIs

All modules are TypeScript (strict, `noUncheckedIndexedAccess`), ESM, and start with
`// SPDX-License-Identifier: AGPL-3.0-or-later`. Types live in `src/types.ts`. Formatting helpers in `src/util/format.ts`,
parsers in `src/analytics/parse.ts` (already implemented, do not edit).

## src/analytics (pure functions, no I/O, fully unit tested)

### cluster.ts
```ts
export function senderKey(m: GmailMsg): string                       // listId if present else fromEmail
export function clusterMessages(msgs: GmailMsg[]): Cluster[]         // kind 'list' (by listId) else 'sender' (merged); sorted bytes desc
export function mergeSenders(msgs: GmailMsg[]): Map<string, string>  // email -> canonical group key (same domain + display-name token Jaccard >= 0.6)
export function tfidf(texts: string[]): { vectors: Array<Map<number, number>>; vocab: string[] }  // L2-normalised
export function cosine(a: Map<number, number>, b: Map<number, number>): number
export function subjectClusters(msgs: GmailMsg[], threshold?: number /*0.55*/): Cluster[]  // leader-follower on normalizeSubject; kind 'subject'; deterministic
```
### scores.ts
```ts
export interface SafetyCtx { vip: Set<string>; me: string; now: number; userLabels: Set<string>; repliedThreads: Set<string> }
export function buildVip(sent: Array<{ recipients: string[] }>, me: string): Set<string>
export function repliedThreads(sent: GmailMsg[]): Set<string>        // threadIds containing a message labelled SENT
export function safety(m: GmailMsg, ctx: SafetyCtx): SafetyResult
   // blocked (score 100): STARRED, SENT, DRAFT labels, or sender is `me`.
   // +60 sender in vip, +40 thread replied, +25 any user label, +20 IMPORTANT, +15 younger than 30 days,
   // -25 has listId, -15 has listUnsub, -20 CATEGORY_PROMOTIONS|CATEGORY_FORUMS|CATEGORY_UPDATES|CATEGORY_SOCIAL, -10 UNREAD. clamp 0..100.
   // level: blocked | high(>=60) | medium(>=30) | low. reasons[] human strings for every rule that fired.
export interface NoiseRow { key: string; label: string; bytes: number; count: number; readRate: number; perMonth: number; score: number }
export function noiseScores(msgs: GmailMsg[]): NoiseRow[]            // per sender group; readRate = share WITHOUT UNREAD label; score = bytes*(1-readRate)*(1+log10(1+perMonth)); desc
```
### planner.ts
```ts
export interface PlanGroup { id: string; label: string; bytes: number; risk: number /*0..100*/; blocked?: boolean }
export function planBudget(groups: PlanGroup[], targetBytes: number, maxRisk?: number /*60*/): { selected: string[]; bytes: number; met: boolean }
   // greedy by bytes/(1+risk/25) desc, skipping blocked and risk>maxRisk, stop when bytes>=target.
export function whatIf(usage: number, limit: number, freeing: number): { after: number; pct: number; over: boolean }
export function formatDelta... NOT needed
```
### drive.ts
```ts
export interface DupGroup { hash: string; size: number; files: DriveFile[]; wasted: number }   // wasted = size*(n-1)
export function findDuplicates(files: DriveFile[]): DupGroup[]       // owned, not trashed, not folder, size>0, same sha256 (else md5); groups>=2; wasted desc
export type KeepRule = 'newest' | 'oldest' | 'shortestName' | { folderId: string }
export function keepRule(g: DupGroup, rule: KeepRule): { keep: DriveFile; remove: DriveFile[] }
export function revisionBloat(files: DriveFile[], minExtra?: number /*1 MiB*/): Array<{ file: DriveFile; extra: number }>  // owned, quota-size >= minExtra, desc
export function coldFiles(files: DriveFile[], now: number, years?: number /*2*/, minSize?: number /*10 MiB*/): DriveFile[]  // owned, not trashed, size>=minSize, (viewed ?? modified) older than cutoff; size desc
export function publicLinks(files: DriveFile[]): DriveFile[]         // owned, not trashed, publicLink
export function buildDriveTree(files: DriveFile[], opts?: { maxChildren?: number /*24*/ }): TreeNode // root 'My Drive'; owned, not trashed; value = quota (or size); folders sum; extra children folded in an 'other' node
export function trashedBytes(files: DriveFile[]): number
export function shareGraph(files: DriveFile[], me: string): GraphData // nodes: me, owners of files you share; file nodes optional no. link me->owner weight bytes
```
### series.ts
```ts
export function monthlyByCluster(msgs: GmailMsg[], clusters: Cluster[], topN?: number /*8*/): { months: string[]; series: Array<{ key: string; label: string; values: number[] }> }
   // months contiguous from first to last (YYYY-MM, UTC); top N clusters by bytes, remainder summed in key 'other'
export function dailyBytes(msgs: GmailMsg[]): Map<string, number>    // dayKey -> bytes
export function anomalies(values: number[], z?: number /*3.5*/): number[]   // indices where modified z-score (median/MAD) > z
export function linearForecast(monthly: number[], currentUsed: number, cap: number): { monthsToCap: number | null; slope: number }  // least squares slope on last 12 values; null if slope<=0 or already over
export interface SankeyData { nodes: Array<{ id: string; label: string }>; links: Array<{ source: string; target: string; value: number }> }
export function sankeyData(msgs: GmailMsg[], recommend: (m: GmailMsg) => string, topDomains?: number /*8*/): SankeyData  // domain -> category (CATEGORY_* label or 'Other') -> Read|Unread -> recommendation label; ids unique per column (prefix d:,c:,s:,r:)
```
### graphs.ts
```ts
export function senderGraph(msgs: GmailMsg[], opts?: { minBytes?: number; maxNodes?: number /*150*/ }): GraphData // nodes=sender groups (mergeSenders), links: same thread or same listId or same domain(weight 0.2)
export function louvainCommunities(g: GraphData): Map<string, number> // uses graphology + graphology-communities-louvain; deterministic via rng seed
export function pageRank(g: GraphData, damping?: number, iters?: number): Map<string, number> // power iteration, sums to 1
export function correspondentGraph(msgs: GmailMsg[], me: string): GraphData // nodes people; links between co-recipients/senders in same thread
export function repeatedAttachmentGroups(msgs: GmailMsg[]): Array<{ key: string; ids: string[]; bytes: number }> // same normalizeSubject and size within 2%, >=3 msgs, bytes desc
```
### embed.ts
```ts
export function hashVectors(texts: string[], dims?: number /*128*/): number[][]   // hashed tf-idf bag of words, L2 normalised, deterministic
export function embed2d(texts: string[], seed?: number /*42*/): Array<[number, number]> // umap-js with seeded PRNG; n<8 -> circle layout; output scaled to [0,1]
```
### csv.ts / filters.ts / unsub.ts
```ts
export function toCsv(rows: Array<Array<string | number | undefined>>): string   // RFC 4180 quoting, \r\n; cells starting with = + - @ \t \r get a leading ' (CSV injection guard)
export function planToCsv(items: BasketItem[]): string
export function sizeQuery(bytes: number): string                    // e.g. 5*2**20 -> 'larger:5M', 1.5 GiB-> 'larger:1536M', <1MiB -> 'larger:Nk'
export interface FilterSpec { from?: string; listId?: string; minSizeBytes?: number; action: 'trash' | 'skipInbox' | 'label'; labelId?: string }
export function buildFilter(s: FilterSpec): { criteria: Record<string, unknown>; action: Record<string, unknown>; search: string } // Gmail settings.filters body + equivalent search string; throws if no criteria
export interface UnsubRow { key: string; label: string; http: string[]; mailto: string[]; bytes: number; count: number; readRate: number }
export function unsubscribeRadar(msgs: GmailMsg[]): UnsubRow[]       // senders with List-Unsubscribe, http only https? keep via parseListUnsubscribe, bytes desc
```

## src/api (I/O through GoogleHttp from ./http, constructor takes http)
```ts
export class GmailApi {
  constructor(http: GoogleHttp)
  profile(): Promise<{ email: string; messagesTotal: number; historyId: string }>
  labelCounts(ids: string[]): Promise<Array<{ id: string; name: string; messagesTotal: number; messagesUnread: number }>>
  listIds(q: string, o?: { includeSpamTrash?: boolean; signal?: AbortSignal; onPage?: (n: number) => void; max?: number }): Promise<string[]>
  getMeta(id: string, signal?: AbortSignal): Promise<GmailMsg>
  scan(tiers: string[], o: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void; concurrency?: number; known?: Set<string> }): Promise<GmailMsg[]> // tier queries in order, dedupe, skip known ids
  history(startHistoryId: string): Promise<{ added: string[]; deleted: string[]; historyId: string }>
  trash(ids: string[]): Promise<void>        // users.messages.batchModify addLabelIds ['TRASH'], chunks <= 1000
  untrash(ids: string[]): Promise<void>
  deletePermanently(ids: string[], confirmation: string): Promise<void> // throws unless confirmation === `DELETE ${ids.length}`; batchDelete chunks <= 500
  createLabel(name: string): Promise<{ id: string; name: string }>
  addLabel(ids: string[], labelId: string): Promise<void>
  listFilters(): Promise<unknown[]>; createFilter(body: unknown): Promise<{ id: string }>; deleteFilter(id: string): Promise<void>
}
export class DriveApi {
  constructor(http: GoogleHttp)
  about(): Promise<QuotaInfo>
  listFiles(o?: { signal?: AbortSignal; onProgress?: (p: ScanProgress) => void }): Promise<DriveFile[]> // includes trashed, pageSize 1000
  revisions(fileId: string): Promise<Array<{ id: string; size: number; keepForever: boolean; modifiedTime: number }>>
  deleteRevision(fileId: string, revisionId: string): Promise<void>
  trash(ids: string[]): Promise<void>; untrash(ids: string[]): Promise<void>
  deletePermanently(ids: string[], confirmation: string): Promise<void> // `DELETE ${n}`
  emptyTrash(confirmation: string): Promise<void>                       // 'EMPTY TRASH'
}
```
Unit costs for the scheduler: Gmail messages.get 5, list 5, batchModify 50, batchDelete 50, labels.get 1, history.list 2; Drive 1.
