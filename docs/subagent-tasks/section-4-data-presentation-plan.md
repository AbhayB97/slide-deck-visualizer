# Section 4 Implementation Plan: New Ideas For Data Presentation

## Goal

Shift the dashboard from a single-week, heatmap-first view toward a trend-first reporting surface that explains change over time, separates repeat risk from one-week noise, exposes status mix and training-title hotspots, and gives leaders a richer per-user drill-down using data already stored in `history`, `metrics`, `checkpoints`, `parsedRows`, and current list endpoints.

## Proposed Tickets

### Ticket 1: Add Trend-First Overview Strip

- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/history/route.ts`, `lib/history.ts`
- Acceptance criteria:
  - Dashboard top section shows weekly trend cards or a compact trend strip before the current high-risk panel.
  - Trend strip includes incomplete item count, people-on-list count, and implied completion rate by week.
  - Week selector and selected week state remain compatible with the existing dashboard flow.
  - Empty or short history gracefully degrades without breaking the current dashboard.
- Implementation notes:
  - Reuse `history.weeks` as the primary source for longitudinal data.
  - Compute completion rate from `masterCount` and weekly incomplete/offender counts with clear fallback when `masterCount` is unavailable.
  - Keep the first iteration in the current dashboard rather than creating a new route.

### Ticket 2: Add Week-Over-Week Segmentation and Comparison

- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/metrics/route.ts`, `lib/metrics.ts`
- Acceptance criteria:
  - Dashboard shows summary buckets for `New This Week`, `Improved`, `Repeated`, and `Worsened or Higher Load`.
  - Buckets are derived from `deltaFromPrevWeek` plus presence in current and previous week data.
  - Clicking a bucket filters or anchors the existing user list to the relevant subset.
  - If no prior week exists, the UI clearly states that week-over-week comparison is unavailable.
- Implementation notes:
  - Use existing `metrics.users` as the default source.
  - If metrics are missing, keep the current on-demand fallback behavior and shape the client state around a reusable comparison model.
  - Normalize names consistently with the existing `normalizeNameKey` helper unless an email-based key is later exposed in metrics.

### Ticket 3: Add Status-Split Risk Reporting

- Priority: `P1`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/processCsvSnapshot.ts`, `app/api/latest-snapshot/route.ts`, `app/api/snapshot/route.ts`
- Acceptance criteria:
  - Current-week reporting distinguishes `Not Started` vs `In Progress`.
  - Dashboard includes status-split KPI tiles and at least one visual distribution view.
  - User list can be filtered by status segment.
  - Status totals reconcile with current snapshot rows.
- Implementation notes:
  - Start with client-side aggregation from `parsedRows` because snapshot rows already include `status`.
  - If the component becomes too heavy, move grouped calculations into a derived server response or helper function.
  - Keep status labels normalized to the same casing and vocabulary used by ingest.

### Ticket 4: Add Checkpoint Persistence Panel

- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/checkpoints/route.ts`, `lib/checkpointHistory.ts`
- Acceptance criteria:
  - Dashboard includes a checkpoint panel for repeat high-risk users.
  - Panel shows top recurring users, checkpoint appearances, and last seen checkpoint date.
  - Panel distinguishes persistent risk from one-off appearances.
  - Loading and empty states are handled without blocking the rest of the dashboard.
- Implementation notes:
  - Use `/api/checkpoints` as the source of truth.
  - Keep the first version focused on ranked lists and summary counts rather than a full standalone page.
  - Structure the client state so a future checkpoint analytics page can reuse the same fetch and transformation logic.

### Ticket 5: Add Training Title Hotspot Analytics

- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/processCsvSnapshot.ts`
- Acceptance criteria:
  - Dashboard surfaces top incomplete training titles for the selected week.
  - View includes count of incomplete rows per title and, where available, unique affected users.
  - Selecting a title filters or scopes the user/session drill-down.
  - Titles with low quality or blank values are excluded or grouped into a clear fallback bucket.
- Implementation notes:
  - Use current snapshot `parsedRows.title` directly for initial aggregation.
  - Prefer a compact ranked table or lollipop-style list over another dense card grid.
  - Keep the aggregation logic isolated so it can later support cross-week title trends.

### Ticket 6: Expand User Drill-Down Into Narrative Profile

- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `app/api/metrics/route.ts`, `app/api/checkpoints/route.ts`
- Acceptance criteria:
  - User modal shows oldest open item, aging buckets, title counts, and week-over-week change for the selected person.
  - Modal surfaces checkpoint persistence if the selected user appears in checkpoint data.
  - Session list remains available beneath the new summary area.
  - Modal works for users with no previous-week comparison or no checkpoint history.
- Implementation notes:
  - Build the first iteration from existing current snapshot rows plus already-fetched metrics and checkpoint data.
  - Avoid introducing a dedicated user API until the existing client-side sources are insufficient.
  - Keep the modal component split into summary and session-detail sections to limit JSX sprawl in `SlideDeckVisualizer.jsx`.

### Ticket 7: Create Shared Reporting Selectors and View Models

- Priority: `P2`
- Scope/files: `app/SlideDeckVisualizer.jsx`, `lib/metrics.ts` or a new helper such as `lib/reporting.ts`
- Acceptance criteria:
  - Repeated transformations for trends, status splits, title rollups, checkpoint ranking, and user profile summaries are centralized.
  - Dashboard rendering code consumes stable view-model shapes instead of recomputing ad hoc maps inline.
  - Unit-test target seams are clear even if tests are added in a later ticket.
- Implementation notes:
  - This is a support ticket to keep the dashboard change set maintainable.
  - Favor pure helpers that accept `history`, `metrics`, `parsedRows`, `masterCount`, and checkpoint payloads and return UI-ready summaries.
  - Do not over-abstract chart primitives; centralize only data shaping.

## Dependencies

- Existing weekly history from `lib/history.ts` and `/api/history`.
- Existing metrics with `deltaFromPrevWeek` from `lib/metrics.ts` and `/api/metrics`.
- Existing checkpoint summaries from `app/api/checkpoints/route.ts`.
- Current snapshot row fields from `/api/latest-snapshot` and `/api/snapshot`, especially `fullName`, `status`, `title`, and `sentDate`.
- Current master population count from `/api/current-lists`.
- UX fixes from section 3 are not a hard blocker, but modal accessibility work should be coordinated with Ticket 6 to avoid duplicate modal refactors.
- Data integrity fixes from section 2 improve confidence in trend correctness; trend tickets can start before that work but should assume historical ordering may need correction.

## Risks

- History ordering is currently tied to upload time, so trend views can tell the wrong story until latest-pointer and business-week correctness are fixed.
- Metrics identity still relies on names in some paths; name drift can weaken week-over-week comparisons until email-based identity is exposed consistently.
- `SlideDeckVisualizer.jsx` is already carrying fetch, state, derived data, and modal logic; adding reporting features without shared selectors will make it brittle.
- Current APIs expose enough data for a first pass, but client-side aggregation may become expensive or repetitive as the dashboard grows.
- Leadership-facing completion-rate framing depends on whether `masterCount` is the correct denominator for every reporting use case.

## Pseudocode

```text
loadDashboard():
  history = fetch("/api/history")
  snapshot = fetch(selectedWeek ? `/api/snapshot?week=${selectedWeek}` : "/api/latest-snapshot")
  metrics = fetch(`/api/metrics?week=${resolvedWeekId}`)
  checkpointSummary = fetch("/api/checkpoints")
  currentLists = fetch("/api/current-lists")

  trendModel = buildTrendModel(history.weeks, currentLists.masterCount)
  comparisonModel = buildWeekComparisonModel(snapshot.parsedRows, metrics.users, metrics.prevWeekId)
  statusModel = buildStatusSplitModel(snapshot.parsedRows)
  checkpointModel = buildCheckpointPanelModel(checkpointSummary.users)
  titleModel = buildTitleAnalyticsModel(snapshot.parsedRows)
  userProfileModel = buildUserProfileModels({
    parsedRows: snapshot.parsedRows,
    metricsUsers: metrics.users,
    checkpointUsers: checkpointSummary.users,
  })

renderDashboard():
  renderTrendStrip(trendModel)
  renderComparisonBuckets(comparisonModel)
  renderStatusSplitTiles(statusModel)
  renderCheckpointPanel(checkpointModel)
  renderTitleHotspots(titleModel)
  renderExistingUserList(filteredUsers)
  if selectedUser:
    renderUserProfileModal(userProfileModel[selectedUser])

buildTrendModel(weeks, masterCount):
  sort weeks by canonical business week when available
  return weeks.map(week => {
    incompleteItems = number(week.totalIncomplete ?? 0)
    peopleOnList = number(week.offenderCount ?? 0)
    completionRate = masterCount > 0
      ? ((masterCount - peopleOnList) / masterCount) * 100
      : null
    return {
      weekId,
      incompleteItems,
      peopleOnList,
      completionRate,
    }
  })

buildWeekComparisonModel(parsedRows, metricsUsers, prevWeekId):
  currentCountsByUser = group offender rows by normalized user key
  deltasByUser = index metricsUsers by normalized name key
  buckets = {
    newThisWeek: [],
    improved: [],
    repeated: [],
    worsened: [],
  }

  for each user in currentCountsByUser:
    delta = deltasByUser[user.key]?.deltaFromPrevWeek ?? null
    if prevWeekId is null:
      continue
    if delta is null:
      buckets.repeated.push(user)
    else if delta < 0:
      buckets.improved.push(user)
    else if delta === 0:
      buckets.repeated.push(user)
    else:
      buckets.worsened.push(user)

  identify newThisWeek from users present now with no prior count in metrics source
  return { prevWeekId, buckets }

buildStatusSplitModel(parsedRows):
  offenderRows = parsedRows.filter(status in ["not started", "in progress"])
  notStarted = offenderRows.filter(status == "not started")
  inProgress = offenderRows.filter(status == "in progress")
  ageBuckets = group offenderRows by pendingDays(sentDate) into [0-7, 8-14, 15+]
  return {
    totals: {
      notStartedCount,
      inProgressCount,
      offenderCount,
    },
    ageBuckets,
    usersByStatus,
  }

buildCheckpointPanelModel(checkpointUsers):
  topRecurring = checkpointUsers
    .sort by checkpointsOnList desc, then email/name
    .slice(0, 10)
  summary = {
    repeatersOverThreshold: count where checkpointsOnList >= 2,
    highestPersistence: max(checkpointsOnList),
  }
  return { topRecurring, summary }

buildTitleAnalyticsModel(parsedRows):
  offenderRows = parsedRows.filter(isOffender)
  titleMap = {}
  for row in offenderRows:
    titleKey = normalizeTitle(row.title) or "Unknown title"
    titleMap[titleKey].items += 1
    titleMap[titleKey].users.add(row.fullName)
  return ranked list by items desc with uniqueUserCount

buildUserProfileModels({ parsedRows, metricsUsers, checkpointUsers }):
  groupedSessions = group offender rows by fullName
  deltaIndex = index metricsUsers by normalized name
  checkpointIndex = index checkpointUsers by email or normalized display name fallback

  for each userName in groupedSessions:
    sessions = groupedSessions[userName]
    oldestOpen = min(sentDate)
    ageBuckets = bucketByPendingDays(sessions)
    titleCounts = count by title
    delta = deltaIndex[normalizeName(userName)]?.deltaFromPrevWeek ?? null
    checkpointStats = checkpointIndex[userName] ?? null

    profile[userName] = {
      summary: { oldestOpen, ageBuckets, titleCounts, delta, checkpointStats },
      sessions,
    }

  return profile
```
