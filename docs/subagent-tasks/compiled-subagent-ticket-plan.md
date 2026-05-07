# Subagent Ticket Plan

Date: 2026-05-07
Source: `docs/subagent-review.md`
Method: five software-development-oriented subagent planning passes, merged into one implementation plan

## Recommended Execution Order

1. Security
2. Data Handling
3. UX/UI
4. Data Presentation
5. Additional Features

Rationale:
- Security and Blob privacy change the contracts that admin and reporting flows depend on.
- Data handling fixes stabilize snapshot correctness before building more reporting on top.
- UX/UI can proceed partly in parallel, but some state messaging depends on corrected data semantics.
- Data presentation and additional features should consume the stabilized contracts instead of entrenching current weaknesses.

## 1. Security

### Goal

Add server-side authorization, remove public access to sensitive Blob artifacts, constrain ingestion to trusted server-issued file references, and add basic abuse controls and auditability without breaking the current App Router structure.

### Proposed Tickets

#### Ticket 1.1: Protect admin pages and sensitive API routes with server-side auth
- Priority: `P0`
- Scope/files: `middleware.ts`, `lib/authz.ts`, `app/admin/upload/page.tsx`, `app/admin/upload-master/page.tsx`, `app/api/upload-csv/route.ts`, `app/api/process-csv/route.ts`, `app/api/process-master/route.ts`, `app/api/latest-snapshot/route.ts`, `app/api/snapshot/route.ts`, `app/api/current-lists/route.ts`, `app/api/checkpoints/route.ts`
- Acceptance criteria:
  - Unauthenticated admin page requests redirect to sign-in.
  - Unauthenticated protected API requests return `401`.
  - Authenticated non-admin users receive `403` on admin-only routes.
  - Protection happens before any Blob read or write.
- Implementation notes:
  - Keep the provider pluggable.
  - Centralize role checks in one helper.
  - Separate read and write permissions so viewer roles can be added later.

#### Ticket 1.2: Make Blob storage private and remove raw Blob URL exposure
- Priority: `P0`
- Scope/files: `lib/storage.ts`, `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`, `lib/history.ts`, `lib/metrics.ts`, `lib/checkpointHistory.ts`, `app/admin/upload/page.tsx`, `app/admin/upload-master/page.tsx`, `app/api/csv-headers/route.ts`
- Acceptance criteria:
  - Uploaded CSVs and derived JSON are stored privately.
  - Admin UI no longer renders raw Blob URLs.
  - Header detection uses a protected server route instead of browser fetches to Blob.
  - Sensitive artifact reads happen server-side only.
- Implementation notes:
  - Return `filePath`, not `fileUrl`, from upload flows.
  - Replace any persisted public `snapshotUrl` dependency with an internal path or opaque ref.

#### Ticket 1.3: Restrict processing to trusted blob paths only
- Priority: `P0`
- Scope/files: `app/api/process-csv/route.ts`, `app/api/process-master/route.ts`, `app/api/upload-csv/route.ts`, `lib/storage.ts`, `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`
- Acceptance criteria:
  - Processing routes reject arbitrary `fileUrl` values.
  - Only server-issued blob paths are accepted.
  - CSV read helpers do not fetch arbitrary external URLs in normal ingest.
- Implementation notes:
  - Narrow the contract to `filePath`.
  - Validate allowed upload prefixes and extensions.

#### Ticket 1.4: Add request-size limits, rate limiting, and audit logs
- Priority: `P1`
- Scope/files: `app/api/upload-csv/route.ts`, `app/api/process-csv/route.ts`, `app/api/process-master/route.ts`, `lib/rateLimit.ts`, `lib/auditLog.ts`
- Acceptance criteria:
  - Oversized uploads are rejected early.
  - Upload/process routes enforce rate limits.
  - Structured audit logs capture actor, route, artifact path, and outcome.
  - Rate-limited requests return `429`.

#### Ticket 1.5: Minimize sensitive data exposure in read APIs
- Priority: `P1`
- Scope/files: `app/api/latest-snapshot/route.ts`, `app/api/snapshot/route.ts`, `app/api/current-lists/route.ts`, `app/api/checkpoints/route.ts`, `lib/snapshots.ts`, `lib/lists.ts`
- Acceptance criteria:
  - Protected read APIs require authenticated access.
  - Responses return only fields actually used by the UI.
  - Summary and detail endpoints are separated where needed.

#### Ticket 1.6: Move winner selection server-side if fairness matters
- Priority: `P3`
- Scope/files: `components/MegaGrid.tsx`, `app/api/draw/route.ts`, `lib/drawAudit.ts`
- Acceptance criteria:
  - Winner selection uses server-side randomness.
  - Draws are authenticated and auditable.
  - The persisted result drives the final winner shown in the UI.

### Dependencies

- `1.1` before all other security tickets.
- `1.2` before `1.3`, because private Blob storage changes the ingest contract.
- `1.4` can run in parallel after identity/actor context exists.
- `1.5` depends on route protection being in place.

### Risks

- Auth provider choice is still open.
- Private Blob storage will break current client-side header loading unless the replacement lands in the same phase.
- Historical artifacts currently persist public URLs in some places and need a compatibility layer.

### Pseudocode

```ts
export async function requireAdmin(request: Request) {
  const session = await getSessionFromProvider(request);
  if (!session?.userId) throw unauthorized();
  if (!session.roles?.includes("admin")) throw forbidden();
  return session;
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin(request);
  await enforceRateLimit({ key: actor.userId, route: "upload-csv" });
  const file = (await request.formData()).get("file");
  assertIsCsvFile(file);
  assertWithinSizeLimit(file.size, MAX_UPLOAD_BYTES);
  const uploaded = await uploadCsv(file, { prefix: "uploads/raw", access: "private" });
  await writeAuditLog({ actorId: actor.userId, action: "csv.uploaded", filePath: uploaded.pathname });
  return json({ success: true, filePath: uploaded.pathname, uploadedAt: uploaded.uploadedAt });
}
```

## 2. Data Handling

### Goal

Make snapshot and master ingestion immutable, auditable, and recoverable. Split latest-uploaded from latest-business-week, persist ingest manifests, and add deterministic rebuild flows for history, metrics, and checkpoint indexes.

### Proposed Tickets

#### Ticket 2.1: Introduce immutable snapshot versions and canonical pointers
- Priority: `P0`
- Scope/files: `lib/processCsvSnapshot.ts`, `lib/history.ts`, `lib/snapshots.ts`, `lib/storage.ts`
- Acceptance criteria:
  - Each snapshot ingest writes to a unique versioned path.
  - Pointer artifacts exist for `latest-uploaded`, `latest-business-week`, and `latest-by-week/<weekId>`.
  - Immutable payloads do not rely on `allowOverwrite: true`.

#### Ticket 2.2: Correct latest-pointer semantics and backfill behavior
- Priority: `P0`
- Scope/files: `lib/snapshots.ts`, `lib/history.ts`, `lib/lists.ts`, `lib/metrics.ts`
- Acceptance criteria:
  - Backfilled older uploads do not automatically become the live dashboard.
  - Canonical latest snapshot resolves by business-week logic, not `uploadedAt`.
  - Upload history and business-week ordering can both be queried.

#### Ticket 2.3: Add ingest manifests with row accounting and conflict reporting
- Priority: `P1`
- Scope/files: `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`, new manifest helpers under `lib/`
- Acceptance criteria:
  - Snapshot ingest records source, accepted, and rejected row counts plus rejection reasons.
  - Master ingest records duplicate-email conflicts and canonical chosen names.
  - Manifest references source CSV and derived artifacts.

#### Ticket 2.4: Make master uploads immutable and normalize identity consistently
- Priority: `P1`
- Scope/files: `lib/processMaster.ts`, `lib/lists.ts`, shared normalization helpers
- Acceptance criteria:
  - Master uploads are versioned with a `latest-master` pointer.
  - Duplicate emails are reported.
  - Name and email normalization rules are centralized and reused downstream.

#### Ticket 2.5: Add repair/rebuild flows for history, metrics, and checkpoints
- Priority: `P1`
- Scope/files: `lib/history.ts`, `lib/metrics.ts`, `lib/checkpointHistory.ts`, new repair module and admin trigger
- Acceptance criteria:
  - The system can rebuild history, metrics, and checkpoint indexes from committed artifacts.
  - Partial ingest failures no longer require manual blob surgery.

#### Ticket 2.6: Refactor ingest into staged write flow with resumable status
- Priority: `P2`
- Scope/files: `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`, manifest helpers
- Acceptance criteria:
  - Ingest records stage transitions like `received`, `parsed`, `normalized`, `derived`, `committed`, `failed`.
  - Canonical pointers update only after required artifacts exist.

### Dependencies

- `2.1` before `2.2`.
- `2.3` before `2.5` and `2.6`.
- `2.4` can run in parallel with `2.3`, but both must converge on shared normalization helpers.

### Risks

- Existing readers assume `snapshots/<week>.json` and `master/latest.json`.
- Historical blobs may not contain enough metadata for perfect manifests.
- Blob storage does not provide multi-object transactions, so staged commit is the practical substitute.

### Pseudocode

```ts
type SnapshotManifest = {
  ingestId: string;
  status: "received" | "parsed" | "normalized" | "derived" | "committed" | "failed";
  uploadedAt: string;
  businessWeekId: string;
  sourceFilePath: string;
  snapshotVersionPath?: string;
  metricsPath?: string;
  checkpointPath?: string;
  counts: { sourceRows: number; acceptedRows: number; rejectedRows: number };
  rejections: Array<{ reason: string; count: number }>;
};

async function processCsvSnapshot(filePath: string, mapping: FieldMapping) {
  const manifest = await createSnapshotManifest(filePath);
  const parsed = parseCsv(await getCsvFromPath(filePath));
  await saveManifest(updateParsedCounts(manifest, parsed.rows.length));
  const normalized = normalizeSnapshotRows(parsed.rows, mapping);
  await saveManifest(updateNormalizedState(manifest, normalized));
  const snapshotVersionPath = buildSnapshotVersionPath(manifest.businessWeekId, manifest.ingestId);
  await writeJson(snapshotVersionPath, buildSnapshotPayload(normalized.accepted, manifest));
  await promoteSnapshotPointers(snapshotVersionPath, manifest.businessWeekId);
  await upsertHistoryFromManifest(manifest);
  await saveManifest(markCommitted(manifest, snapshotVersionPath));
}
```

## 3. UX/UI

### Goal

Address accessibility, mobile behavior, multi-step admin flow clarity, and UI trust issues while staying within the existing Next.js app structure.

### Proposed Tickets

#### Ticket 3.1: Make dashboard dialogs accessible and predictable
- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, optional shared dialog helper in `components/`
- Acceptance criteria:
  - Focus moves into the dialog on open.
  - `Escape` closes it.
  - Focus is trapped and restored correctly.
  - Background scroll is locked while open.

#### Ticket 3.2: Fix responsive layout for dashboard header and full-screen draw
- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `components/MegaGrid.tsx`, optionally `app/globals.css`
- Acceptance criteria:
  - Full-screen draw removes the global `scale-[0.85]` approach.
  - Small screens use fewer columns and larger tap targets.
  - Dashboard header stacks into clearer zones on mobile.

#### Ticket 3.3: Turn both admin uploads into explicit step-flow UX
- Priority: `P1`
- Scope/files: `app/admin/upload/page.tsx`, `app/admin/upload-master/page.tsx`
- Acceptance criteria:
  - Pages show explicit steps like `Upload`, `Map fields`, `Process`, `Done`.
  - Disabled actions explain why they are disabled.
  - Success states include obvious next actions.

#### Ticket 3.4: Clarify empty, error, and success states
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/admin/upload/page.tsx`, `app/admin/upload-master/page.tsx`
- Acceptance criteria:
  - Dashboard distinguishes missing snapshot, empty parsed rows, and zero incomplete users.
  - Admin success states include contextual next actions and summary metadata.

#### Ticket 3.5: Clean up corrupted glyphs, metadata, and typography polish
- Priority: `P3`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/admin/upload/page.tsx`, `app/globals.css`, `app/layout.tsx`
- Acceptance criteria:
  - Mojibake strings are removed.
  - Product metadata is specific.
  - Body font uses the intended Geist stack.

### Dependencies

- `3.1` before broader overlay polish.
- `3.2` and `3.3` can run in parallel.
- `3.4` depends partly on clearer frontend state branching.

### Risks

- The dashboard and modal live in one large client component and can sprawl further if refactored carelessly.
- Responsive changes may unintentionally degrade the stronger desktop visual rhythm if breakpoints are not isolated.

### Pseudocode

```txt
onTileOpen(event, userName):
  lastTriggerRef = event.currentTarget
  selectedUser = userName

useEffect when selectedUser changes:
  if selectedUser:
    lockBodyScroll()
    focusFirstElement(dialogRef)
    attachKeydown(handleDialogKeys)
  else:
    unlockBodyScroll()
    detachKeydown(handleDialogKeys)
    restoreFocus(lastTriggerRef)

handleDialogKeys(event):
  if event.key == "Escape": closeDialog()
  if event.key == "Tab": trapFocus(dialogRef, event)
```

## 4. Data Presentation

### Goal

Shift the dashboard from a single-week heatmap toward a trend-first reporting surface that explains change over time, distinguishes persistent risk from one-week noise, and gives leaders richer drill-downs using existing history, metrics, checkpoints, and snapshot rows.

### Proposed Tickets

#### Ticket 4.1: Add trend-first overview strip
- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/history/route.ts`, `lib/history.ts`
- Acceptance criteria:
  - Dashboard shows weekly incomplete items, people-on-list counts, and completion-rate trends.
  - Short or empty history degrades cleanly.

#### Ticket 4.2: Add week-over-week segmentation and comparison
- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/metrics/route.ts`, `lib/metrics.ts`
- Acceptance criteria:
  - Dashboard exposes `New This Week`, `Improved`, `Repeated`, and `Worsened`.
  - Clicking a bucket filters or anchors the existing user list.

#### Ticket 4.3: Add status-split risk reporting
- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/processCsvSnapshot.ts`, `app/api/latest-snapshot/route.ts`, `app/api/snapshot/route.ts`
- Acceptance criteria:
  - Current-week reporting distinguishes `Not Started` vs `In Progress`.
  - Users can filter the risk view by status segment.

#### Ticket 4.4: Add checkpoint persistence panel
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/checkpoints/route.ts`, `lib/checkpointHistory.ts`
- Acceptance criteria:
  - Dashboard surfaces top recurring users and checkpoint persistence summaries.

#### Ticket 4.5: Add training-title hotspot analytics
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/processCsvSnapshot.ts`
- Acceptance criteria:
  - Dashboard shows top incomplete training titles and unique affected user counts.

#### Ticket 4.6: Expand user drill-down into narrative profile
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/metrics/route.ts`, `app/api/checkpoints/route.ts`
- Acceptance criteria:
  - Modal shows oldest open item, aging buckets, title counts, week-over-week change, and checkpoint persistence.

#### Ticket 4.7: Create shared reporting selectors and view models
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/reporting.ts`
- Acceptance criteria:
  - Dashboard data shaping is centralized into pure helpers instead of repeated inline transforms.

### Dependencies

- History, metrics, checkpoint, and current-list APIs remain the main data sources.
- UX modal work should be coordinated with `4.6`.
- Data-handling fixes improve trust in trend ordering and comparison correctness.

### Risks

- History ordering is currently tied to upload time and may tell the wrong story until section 2 lands.
- Name-based identity in some metrics paths can weaken week-over-week accuracy.
- `SlideDeckVisualizer.jsx` will get worse quickly without shared reporting helpers.

### Pseudocode

```txt
loadDashboard():
  history = fetch("/api/history")
  snapshot = fetch(selectedWeek ? `/api/snapshot?week=${selectedWeek}` : "/api/latest-snapshot")
  metrics = fetch(`/api/metrics?week=${resolvedWeekId}`)
  checkpoints = fetch("/api/checkpoints")
  currentLists = fetch("/api/current-lists")

  trendModel = buildTrendModel(history.weeks, currentLists.masterCount)
  comparisonModel = buildWeekComparisonModel(snapshot.parsedRows, metrics.users, metrics.prevWeekId)
  statusModel = buildStatusSplitModel(snapshot.parsedRows)
  checkpointModel = buildCheckpointPanelModel(checkpoints.users)
  titleModel = buildTitleAnalyticsModel(snapshot.parsedRows)
  userProfiles = buildUserProfileModels({ parsedRows: snapshot.parsedRows, metricsUsers: metrics.users, checkpointUsers: checkpoints.users })
```

## 5. Additional Features

### Goal

Turn the current snapshot, history, metrics, checkpoint, and draw primitives into operational features that improve reporting, admin workflows, auditability, and data freshness without restructuring the app.

### Proposed Tickets

#### Ticket 5.1: Checkpoint analytics page
- Priority: `P1`
- Scope/files: `app/checkpoints/page.tsx` or `app/admin/checkpoints/page.tsx`, `app/api/checkpoints/route.ts`, `lib/checkpointHistory.ts`
- Acceptance criteria:
  - Page shows total checkpoints, recurring users, latest-seen checkpoint, and checkpoint trends.
  - Users can filter by minimum checkpoint appearances and search by name or email if allowed.

#### Ticket 5.2: Ingest review screen
- Priority: `P1`
- Scope/files: `app/admin/upload/page.tsx`, `app/admin/upload-master/page.tsx`, `app/api/upload-review/route.ts`, `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`, `lib/storage.ts`
- Acceptance criteria:
  - Admin sees a review step before processing with row counts, duplicate emails, missing fields, inferred week/checkpoint, and expected write impact.

#### Ticket 5.3: Draw audit trail
- Priority: `P1`
- Scope/files: `components/MegaGrid.tsx`, `app/api/draws/route.ts`, `lib/drawHistory.ts`, optional `app/admin/draws/page.tsx`
- Acceptance criteria:
  - Each draw persists actor, timestamp, winner, pool size, exclusions, and redraw linkage.
  - UI uses the server result as the committed winner.

#### Ticket 5.4: Eligibility controls and exceptions
- Priority: `P2`
- Scope/files: `lib/lists.ts`, `app/api/current-lists/route.ts`, `app/api/eligibility/route.ts`, `lib/eligibilityRules.ts`, optional `app/admin/eligibility/page.tsx`
- Acceptance criteria:
  - Admins can define manual exclusions, cooldown windows, and future org-based filters.
  - Current lists endpoint returns both computed eligibility and applied-rule metadata.

#### Ticket 5.5: Executive export flow
- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/exports/route.ts`, `lib/exports.ts`, `lib/history.ts`, `lib/metrics.ts`, `app/api/checkpoints/route.ts`
- Acceptance criteria:
  - Admin can request a server-generated executive export with KPIs, week-over-week changes, repeat-risk highlights, and notable modules/users.

#### Ticket 5.6: Operations health dashboard
- Priority: `P3`
- Scope/files: `app/admin/ops/page.tsx`, `app/api/ops/route.ts`, `lib/history.ts`, `lib/metrics.ts`, `lib/checkpointHistory.ts`, `lib/processMaster.ts`, `lib/processCsvSnapshot.ts`
- Acceptance criteria:
  - Page shows latest snapshot/master upload, latest business week, metrics availability, checkpoint coverage, and actionable stale-data warnings.

### Dependencies

- Security hardening should land before broad rollout of checkpoint, export, draw-audit, and ops pages.
- Data-handling fixes for immutable snapshots, latest pointers, and manifests materially improve ingest review, exports, and ops health.
- Draw audit and eligibility cooldowns should share the same winner-history source of truth.

### Risks

- New reporting surfaces are risky until auth and storage privacy are fixed.
- Ingest preview can drift from final processing if preview parsing does not share the same normalization logic.
- Ops health can mislead if it reports artifact presence but not pointer correctness.

### Pseudocode

```ts
POST(request) {
  const { filePath, mapping, mode } = await request.json();
  const csv = await getCsv(filePath);
  const rows = parseCsv(csv);
  const normalized = mode === "snapshot" ? previewSnapshotRows(rows, mapping) : previewMasterRows(rows, mapping);
  return json({
    success: true,
    headers: normalized.headers,
    sourceRowCount: normalized.sourceRowCount,
    acceptedRowCount: normalized.acceptedRowCount,
    rejectedRows: normalized.rejectedRows,
    duplicateEmails: normalized.duplicateEmails,
    inferredWeekId: normalized.inferredWeekId,
    inferredCheckpoint: normalized.inferredCheckpoint,
  });
}
```

## Cross-Cutting Notes

- Section 1 and section 2 should define stable server contracts before major expansion in sections 4 and 5.
- Section 3 can start early, but the empty-state and admin-flow copy should be revisited once sections 1 and 2 settle API semantics.
- `app/SlideDeckVisualizer.jsx` is already overloaded. Any section that adds more reporting should bias toward new pure helpers or extracted components.
- The first implementation wave should prefer internal-only, authenticated, server-shaped data flows over extending current client-driven behavior.
