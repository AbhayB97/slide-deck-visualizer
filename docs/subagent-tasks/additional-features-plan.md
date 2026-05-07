# Additional Features Plan

## Goal

Turn the current snapshot, history, metrics, checkpoint, and draw primitives into operational features that improve reporting, admin workflows, auditability, and data freshness without restructuring the app. The plan stays aligned to the existing Next.js App Router layout, keeps `MegaGrid` as presentation, and adds server-backed artifacts where persistence or policy matters.

## Proposed Tickets

### Ticket 1: Checkpoint Analytics Page

- Priority: `P1`
- Scope/files:
  - `app/checkpoints/page.tsx` or `app/admin/checkpoints/page.tsx`
  - `app/api/checkpoints/route.ts`
  - `lib/checkpointHistory.ts`
  - Optional shared UI extraction from `app/SlideDeckVisualizer.jsx`
- Acceptance criteria:
  - Page shows total checkpoints, top recurring users, latest-seen checkpoint, and a checkpoint-by-checkpoint trend.
  - Users can filter by minimum checkpoint appearances and search by email or display name if available.
  - Data loads from a server route and degrades cleanly on empty history.
  - Page links back to the main dashboard and current week context.
- Implementation notes:
  - Extend the existing checkpoint API instead of creating a parallel aggregation path.
  - Add derived fields server-side such as recurrence buckets, first-seen checkpoint, and trend rows.
  - Keep row-level PII handling consistent with upcoming auth work; do not assume public access.

### Ticket 2: Ingest Review Screen

- Priority: `P1`
- Scope/files:
  - `app/admin/upload/page.tsx`
  - `app/admin/upload-master/page.tsx`
  - New `app/api/upload-review/route.ts`
  - `lib/processCsvSnapshot.ts`
  - `lib/processMaster.ts`
  - `lib/storage.ts`
- Acceptance criteria:
  - After upload and mapping, admin sees a review step before processing.
  - Review includes detected headers, source row count, accepted/rejected counts, duplicate emails, missing required fields, inferred week/checkpoint, and expected overwrite/version impact.
  - Process action stays disabled until review data is loaded and required mappings are valid.
  - Errors distinguish file-read issues from validation issues.
- Implementation notes:
  - Move CSV header and preview parsing behind a protected server route; the browser should stop fetching raw blob URLs directly.
  - Reuse parser normalization logic so preview and final processing do not drift.
  - Return lightweight preview artifacts only; do not persist a snapshot during review.

### Ticket 3: Draw Audit Trail

- Priority: `P1`
- Scope/files:
  - `components/MegaGrid.tsx`
  - New `app/api/draws/route.ts`
  - New `lib/drawHistory.ts`
  - `app/api/current-lists/route.ts`
  - Optional `app/admin/draws/page.tsx`
- Acceptance criteria:
  - Each completed draw persists timestamp, actor, winner, eligible pool size, pool source week, exclusions applied, and redraw linkage if present.
  - `MegaGrid` uses the server result for the final winner state instead of only client-side selection.
  - Admins can review recent draws and see who initiated each one.
  - Failed persistence does not silently show an unlogged winner.
- Implementation notes:
  - Keep animation client-side, but make the committed winner come from a POST response.
  - Use a versioned append-only store for draw history rather than mutating one record in place.
  - Leave room for stronger randomness and auth once the security work lands.

### Ticket 4: Eligibility Controls And Exceptions

- Priority: `P2`
- Scope/files:
  - `lib/lists.ts`
  - `app/api/current-lists/route.ts`
  - New `app/api/eligibility/route.ts`
  - New `lib/eligibilityRules.ts`
  - Optional `app/admin/eligibility/page.tsx`
  - `components/MegaGrid.tsx`
- Acceptance criteria:
  - Admin can define manual exclusions, cooldown windows for recent winners, and optional filters such as department or location when those fields exist.
  - Current lists endpoint returns both raw eligible users and applied-rule metadata.
  - Draw UI clearly shows why someone is excluded.
  - Rules are persisted and survive reloads.
- Implementation notes:
  - Keep eligibility derivation server-side; the client should consume computed lists plus rule summaries.
  - Start with a small rule model: manual exclude, temporary exclude-until, recent-winner cooldown.
  - Structure the rule store so future org-based filters can be added without replacing the API.

### Ticket 5: Executive Export Flow

- Priority: `P2`
- Scope/files:
  - `app/SlideDeckVisualizer.jsx`
  - New `app/api/exports/route.ts`
  - New `lib/exports.ts`
  - `lib/history.ts`
  - `lib/metrics.ts`
  - `app/api/checkpoints/route.ts`
- Acceptance criteria:
  - Admin can request a compact executive export that includes headline KPIs, week-over-week changes, repeat-risk highlights, and notable modules or users.
  - Export payload is generated server-side from existing artifacts rather than serializing the whole client snapshot.
  - UI surfaces export status and success/failure clearly.
  - Export events are auditable for later security hardening.
- Implementation notes:
  - Start with JSON or CSV summary artifacts, then add PDF/email formatting later if needed.
  - Build the export around aggregated data, not raw `parsedRows`, to reduce exposure and keep the format stable.
  - Reuse history, metrics, and checkpoint rollups rather than recomputing from scratch in the client.

### Ticket 6: Operations Health Dashboard

- Priority: `P3`
- Scope/files:
  - New `app/admin/ops/page.tsx`
  - New `app/api/ops/route.ts`
  - `lib/history.ts`
  - `lib/metrics.ts`
  - `lib/checkpointHistory.ts`
  - `lib/processMaster.ts`
  - `lib/processCsvSnapshot.ts`
- Acceptance criteria:
  - Page shows last successful snapshot upload, last master upload, latest business week, metrics availability, checkpoint coverage, and stale-data warnings.
  - Health API reports missing or inconsistent artifacts without crashing when blobs are absent.
  - Admin can quickly tell whether the dashboard is fresh and whether dependent artifacts are in sync.
  - Warnings are actionable, not generic.
- Implementation notes:
  - Use read-only derived checks first; do not couple this ticket to a repair tool.
  - Prefer a single health payload that summarizes artifact presence and timestamps.
  - Leave explicit hooks for later reconciliation tooling once immutable ingest lands.

## Dependencies

- Security hardening from `docs/subagent-review.md` should land before broad rollout of checkpoint, export, draw-audit, and ops pages because these features expose or centralize sensitive data.
- Data-handling fixes for immutable snapshots, explicit latest pointers, and ingest manifests materially improve ticket 2, ticket 5, and ticket 6.
- If org-level eligibility filters are desired, the master schema must expand beyond `email` and `name`.
- Draw audit and eligibility cooldowns should share a winner-history source of truth to avoid duplicated policy logic.

## Risks

- Existing public-blob and unauthenticated flows make new reporting surfaces risky until auth and storage privacy are fixed.
- Preview logic in the ingest review screen can drift from final processing if parsing rules are duplicated rather than shared.
- Draw audit can create user trust issues if the UI animation selects a different winner than the persisted server result.
- Eligibility rules can become opaque unless the API returns human-readable exclusion reasons alongside computed lists.
- Executive export scope can sprawl into document-generation work; keep the first version focused on aggregated server-generated summaries.
- Ops health can become misleading if it reports artifact presence but not pointer correctness; tie freshness checks to canonical week selection once data fixes land.

## Pseudocode

```ts
// Checkpoint analytics page
// app/checkpoints/page.tsx
load() {
  const stats = await fetch("/api/checkpoints?view=analytics").then(r => r.json());
  renderSummary(stats.totalCheckpoints, stats.recurringUsers, stats.latestCheckpoint);
  renderTrend(stats.timeline);
  renderLeaderboard(stats.users);
}

// app/api/checkpoints/route.ts
GET(request) {
  const index = await fetchCheckpointIndex();
  const records = await loadCheckpointRecords(index.checkpoints);
  const timeline = records.map(toCheckpointTrendRow);
  const users = aggregateRecurringUsers(records);
  return json({
    success: true,
    totalCheckpoints: records.length,
    latestCheckpoint: timeline.at(-1) ?? null,
    recurringUsers: bucketByRepeatCount(users),
    timeline,
    users,
  });
}

// Ingest review screen
// app/admin/upload/page.tsx
onReviewClick() {
  const preview = await post("/api/upload-review", {
    filePath: uploadResult.filePath,
    mapping,
    mode: "snapshot",
  });
  setReview(preview);
}

// app/api/upload-review/route.ts
POST(request) {
  const { filePath, mapping, mode } = await request.json();
  const csv = await getCsv(filePath);
  const rows = parseCsv(csv);
  const normalized = mode === "snapshot"
    ? previewSnapshotRows(rows, mapping)
    : previewMasterRows(rows, mapping);
  return json({
    success: true,
    headers: normalized.headers,
    sourceRowCount: normalized.sourceRowCount,
    acceptedRowCount: normalized.acceptedRowCount,
    rejectedRows: normalized.rejectedRows,
    duplicateEmails: normalized.duplicateEmails,
    inferredWeekId: normalized.inferredWeekId,
    inferredCheckpoint: normalized.inferredCheckpoint,
    writeImpact: normalized.writeImpact,
  });
}

// Draw audit trail
// components/MegaGrid.tsx
async function commitDraw() {
  const result = await post("/api/draws", {
    weekId,
    requestedPool: eligibleUsers,
    exclusions: activeExclusions,
  });
  animateReveal(result.winner);
  setAuditRecord(result.draw);
}

// app/api/draws/route.ts
POST(request) {
  const { weekId, requestedPool, exclusions } = await request.json();
  const computedPool = await fetchEligiblePool({ weekId, exclusions });
  const winner = selectWinner(computedPool);
  const draw = await appendDrawRecord({
    weekId,
    winner,
    eligibleCount: computedPool.length,
    exclusions,
    actor: getActorFromSession(request),
    createdAt: nowIso(),
  });
  return json({ success: true, winner, draw });
}

// Eligibility controls
// app/api/eligibility/route.ts
POST(request) {
  const rule = validateRule(await request.json());
  await saveEligibilityRule(rule);
  return json({ success: true, rule });
}

// lib/lists.ts
export async function fetchCurrentListsWithRules(context) {
  const base = await fetchCurrentLists();
  const rules = await fetchEligibilityRules();
  const computed = applyEligibilityRules(base.eligibleUsers, rules, context);
  return {
    ...base,
    eligibleUsers: computed.included,
    excludedUsers: computed.excluded,
    appliedRules: computed.appliedRules,
  };
}

// Executive export flow
// app/api/exports/route.ts
POST(request) {
  const { weekId, format } = await request.json();
  const snapshot = await fetchSnapshotByWeek(weekId);
  const metrics = await fetchWeekMetrics(weekId);
  const history = await fetchHistoryIndex();
  const checkpoints = await fetchCheckpointSummary();
  const payload = buildExecutiveSummary({
    snapshot,
    metrics,
    history,
    checkpoints,
  });
  const artifact = await persistExportArtifact(payload, format);
  await appendAdminAudit({ type: "export.created", weekId, format });
  return json({ success: true, exportId: artifact.id, downloadPath: artifact.path });
}

// Ops dashboard
// app/api/ops/route.ts
GET() {
  const history = await fetchHistoryIndex();
  const latestWeek = selectCanonicalLatestWeek(history);
  const latestMetrics = latestWeek ? await fetchWeekMetrics(latestWeek.weekId) : null;
  const checkpoints = await fetchCheckpointIndex();
  const masterMeta = await fetchMasterMetadata();
  return json({
    success: true,
    latestWeek,
    latestSnapshotUploadedAt: latestWeek?.uploadedAt ?? null,
    latestMasterUploadedAt: masterMeta?.uploadedAt ?? null,
    metricsPresent: Boolean(latestMetrics),
    checkpointCoverage: checkpoints.checkpoints.length,
    warnings: buildOpsWarnings({ latestWeek, latestMetrics, checkpoints, masterMeta }),
  });
}
```
