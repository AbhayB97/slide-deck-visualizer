# Subagent Review

Date: 2026-05-07
Scope: cumulative review of the current `slide-deck-visualizer` codebase using five parallel subagent passes plus local validation

## Top Priorities

1. Protect admin and data routes with server-side auth and stop storing sensitive artifacts as public Blob objects.
2. Make snapshot and master ingestion immutable and auditable instead of overwrite-in-place.
3. Separate "latest uploaded" from "latest business week" so backfills do not become the live dashboard.
4. Fix the highest-impact UX issues: modal accessibility, mobile draw layout, unclear multi-step upload flows, and corrupted glyphs.
5. Expand the dashboard from a single-week heatmap into a trend-first reporting surface using the history, metrics, and checkpoint data you already persist.

## 1. Security Review

### Summary

The main security issue is missing server-side access control. Today, anonymous callers can reach privileged upload and processing routes, sensitive read APIs expose employee training data, and raw CSV plus derived JSON artifacts are stored as public Blob objects.

### Findings

- `[critical]` No server-side auth or admin authorization on privileged write paths. This affects `app/api/upload-csv/route.ts`, `app/api/process-csv/route.ts`, `app/api/process-master/route.ts`, and the paired `/admin/*` pages.
- `[high]` Sensitive reporting data is exposed through unauthenticated read APIs. `app/api/latest-snapshot/route.ts`, `app/api/snapshot/route.ts`, `app/api/current-lists/route.ts`, and `app/api/checkpoints/route.ts` can expose names, emails, statuses, sent dates, eligibility, and checkpoint history.
- `[high]` Raw CSVs and derived JSON are written as public Blob objects in `lib/storage.ts`, `lib/processCsvSnapshot.ts`, `lib/processMaster.ts`, `lib/history.ts`, `lib/metrics.ts`, and `lib/checkpointHistory.ts`.
- `[medium]` The processing routes accept client-supplied `fileUrl` values and server-fetch them, which creates an SSRF-style risk and allows ingestion from attacker-controlled sources.
- `[medium]` Upload and processing paths have no evident request-size limits, rate limits, or abuse controls.
- `[low]` The draw uses client-side `Math.random()` in `components/MegaGrid.tsx`, so it is not auditable or manipulation-resistant if fairness matters operationally.

### Positive Notes

- `BLOB_READ_WRITE_TOKEN` is used server-side and not exposed as a public env var.
- CSV mapping is validated against actual headers before processing.
- Random suffixes on uploaded CSV filenames reduce trivial name collisions.

### Recommended Fixes

- Add server-side auth and role checks to all `/admin/*` pages and all sensitive `/api/*` routes.
- Make Blob objects private by default and serve sensitive data only through authenticated server routes.
- Stop returning or rendering raw Blob URLs in admin flows.
- Restrict processing inputs to server-issued Blob paths only.
- Add upload limits, rate limiting, and basic audit logging.
- If draw fairness matters, move winner selection server-side and persist the result.

## 2. Data Handling

### Summary

The ingestion path works, but the biggest weaknesses are version integrity, recoverability, and pointer correctness. The current design can overwrite weekly/master data, treat a backfilled older week as the live dataset, and leave snapshot/history/checkpoint artifacts out of sync after partial failure.

### Findings

- `[high]` Weekly snapshots are not immutable. `lib/processCsvSnapshot.ts` writes to a fixed `snapshots/<week>.json` path with `allowOverwrite: true`, and `lib/history.ts` replaces the row for that week.
- `[high]` "Latest" is chosen by `uploadedAt`, not by business week. A backfilled older CSV uploaded today can become the live dashboard through `lib/history.ts`, `lib/snapshots.ts`, and `lib/lists.ts`.
- `[medium]` Snapshot persistence is non-atomic. Snapshot, latest pointer, history, metrics, and checkpoint updates are separate writes, so partial failure can leave inconsistent state.
- `[medium]` Both ingest paths silently drop malformed rows instead of persisting rejected-row counts or reasons.
- `[medium]` Master data has no history and weak conflict handling. `lib/processMaster.ts` overwrites `master/latest.json`, and duplicate emails keep the first name without warning.
- `[low]` Name normalization is inconsistent across producers and consumers, especially between raw `fullName` storage and later normalized comparisons in `lib/lists.ts`.

### Positive Notes

- Email normalization is consistently applied across the main ingest and read paths.
- CSV parsing handles BOMs and includes a useful UTF-8 to `windows-1252` fallback.
- Readers generally degrade safely on missing blobs and perform some shape validation.

### Recommended Fixes

- Store immutable snapshot and master versions, then maintain explicit pointers like `latest`, `latestByWeek`, and `latestMaster`.
- Separate "latest uploaded" from "latest business week".
- Persist ingest manifests with source row count, accepted row count, rejected row count, and rejection reasons.
- Add a repair path that can rebuild history, metrics, and checkpoint indexes from stored snapshots.
- Surface duplicate-email conflicts and standardize canonical display names during ingest.

## 3. UX/UI

### Summary

The UI baseline is functional and readable, but the main gaps are accessibility, mobile behavior, upload-flow clarity, and polish issues that reduce trust.

### Findings

- `[high]` The user-details modal in `app/SlideDeckVisualizer.jsx` is not fully keyboard-accessible. It lacks focus trapping, Escape-to-close handling, focus restoration, and background scroll lock.
- `[high]` The full-screen draw in `components/MegaGrid.tsx` is cramped on mobile. It starts with dense columns and uses a global `scale-[0.85]` instead of responsive adaptation.
- `[medium]` The dashboard header carries too many controls and status elements in one cluster, which hurts scan speed on smaller screens.
- `[medium]` Both admin upload pages behave like multi-step wizards but do not show explicit steps, progress, or clear reasons why processing remains disabled.
- `[medium]` Empty states are ambiguous. An empty parsed snapshot is treated as "100% completion" even though that can be confused with parsing or mapping issues.
- `[medium]` Visible mojibake strings such as `Â·`, `â€¢`, `â–²`, and `â–¼` damage clarity and perceived reliability.
- `[medium]` Success states on the admin flows do not provide the obvious next actions like opening the dashboard or starting another upload.
- `[low]` `app/layout.tsx` still uses default app metadata, and `app/globals.css` overrides the intended font stack back to Arial.

### Positive Notes

- The dashboard has distinct loading, missing, empty, and loaded states.
- Week selection, refresh, and export actions are easy to discover.
- The draw feature has a stronger visual identity than a typical internal tool.

### Recommended Fixes

- Upgrade the modal and reveal overlays to proper dialog behavior.
- Rework mobile layouts for the dashboard header and full-screen draw without scale hacks.
- Turn both admin pages into explicit step flows with inline guidance.
- Make empty and success states more diagnostic and action-oriented.
- Fix all corrupted glyphs and clean up product metadata and typography.

## 4. New Ideas For Data Presentation

### Summary

The codebase already stores the raw ingredients for better analytical storytelling: weekly history, week-over-week deltas, checkpoint persistence, status splits, send dates, and the master-versus-high-risk universe. The biggest opportunity is to shift from "who is high risk this week" toward "what is changing, who is persistently stuck, and what should leaders do next."

### Opportunities

- Replace the current heatmap-first landing with a trend-first view showing incomplete volume, people-on-list count, and completion rate over time using `lib/history.ts`.
- Add a week-over-week comparison canvas based on `deltaFromPrevWeek` from `lib/metrics.ts` instead of relying only on small badges.
- Surface persistent risk using `/api/checkpoints` so leaders can separate repeat offenders from one-week blips.
- Split risk views by `not started` versus `in progress` using the status breakdown already stored in `lib/processCsvSnapshot.ts`.
- Turn the user modal into a drill-down narrative with oldest open item, aging buckets, title counts, and week-over-week change for that person.
- Add training-title analysis using `parsedRows.title` to show which modules drive incompletion.
- Add coverage reporting using total master count versus current high-risk population so leadership sees completion share, not only exceptions.
- Use encodings better suited for temporal analysis: ranked lollipop charts, sparkline tables, checkpoint dot matrices, and aging histograms.
- Expand the master list shape beyond `email` and `name` if source files contain org attributes, which would unlock team and manager rollups.

### Quick Wins

- Add a weekly trend strip above the heatmap.
- Add "New this week / Improved / Repeated" segmentation.
- Split current risk tiles by status.
- Add aging buckets from `sentDate`.
- Add top recurring users from `/api/checkpoints`.
- Add top recurring training titles from `parsedRows.title`.

### Bigger Bets

- Build a dedicated compliance-story page combining trends, persistence, module hotspots, and drill-downs.
- Extend the master-list schema to support org-based scorecards.
- Add cohort journey views that show how users move across weeks.
- Create an executive briefing export with headline KPIs and actions.

## 5. Additional Features

### Summary

The best adjacent features are the ones that turn current storage primitives into repeatable admin workflows and longitudinal reporting rather than introducing new subsystems.

### Feature Ideas

1. Trend and cohort reporting across weeks.
2. A checkpoint analytics page for repeat high-risk users.
3. An admin ingest review screen with row counts, duplicates, missing fields, inferred week/checkpoint, and expected impact before write.
4. An audit trail for draws and admin actions.
5. Eligibility controls such as exclusions, cooldowns, and filters.
6. Executive exports and scheduled reporting.
7. Per-user profile drilldowns with history and eligibility context.
8. An operations health dashboard with data freshness and pipeline status.

### Priority Order

1. Trend and cohort reporting
2. Checkpoint analytics view
3. Admin ingest review screen
4. Audit trail for draws and admin actions
5. Eligibility controls and exception management
6. User profile drilldowns
7. Executive exports and scheduled reporting
8. Operations health dashboard

### Implementation Notes

- Keep the current architecture and add derived artifacts plus new routes instead of pushing more logic into the client.
- `lib/processCsvSnapshot.ts` is the right place to generate new rollups like new users, resolved users, or future org summaries.
- Extend the existing week-switching and metric-fetch patterns in `app/SlideDeckVisualizer.jsx` for new reporting views.
- Keep `components/MegaGrid.tsx` as presentation and move draw persistence, cooldown logic, and audit recording behind a new API route.
- Extend the existing admin upload pages for preview, validation, confirmation, and post-run summaries.

## Suggested Roadmap

### Now

- Lock down auth and Blob privacy.
- Remove public Blob URLs from browser flows.
- Fix latest-pointer correctness and immutable ingest.
- Repair the highest-impact UX defects.

### Next

- Add trend strips, checkpoint panels, and status-split reporting.
- Add ingest preview and audit logging.
- Add draw auditing and server-side winner persistence.

### Later

- Expand the master schema for org reporting.
- Add executive exports, cohort views, and operations health dashboards.
