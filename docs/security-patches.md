# Security Patch Plan

Date: 2026-05-05
Source review: [`docs/security-review.md`](/abs/path/docs/security-review.md:1)
Ordering: severity ascending

## Ticket 1: Add explicit security headers

Severity: Medium
Related finding:
- Missing explicit security headers and route-hardening configuration

Goal:
- Add baseline browser-side hardening for all app routes.

Recommended changes:
- Update [`next.config.ts`](/abs/path/next.config.ts:1) to define `headers()` for all routes.
- Add at minimum:
  - `Content-Security-Policy`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy`
- If the app must embed Vercel or Blob-hosted assets, keep CSP tight and explicitly allow only required origins.

Implementation notes:
- Start with report-only CSP if you want to avoid breaking the UI immediately.
- Since this is a Next.js app with mostly local assets and API calls, CSP can be fairly strict.
- If middleware is later added for auth, keep security headers either in middleware or `next.config.ts`, but avoid duplicating them in both places.

Acceptance criteria:
- All HTML responses include the agreed security headers.
- No route depends on permissive browser defaults.

## Ticket 2: Remove raw Blob URLs from admin UI

Severity: Medium
Related finding:
- Admin pages disclose raw uploaded Blob URLs in the UI

Goal:
- Stop leaking direct object URLs to administrators and reduce accidental resharing.

Recommended changes:
- Update [`app/admin/upload/page.tsx`](/abs/path/app/admin/upload/page.tsx:1) and [`app/admin/upload-master/page.tsx`](/abs/path/app/admin/upload-master/page.tsx:1).
- Remove the displayed `fileUrl` from the success panel.
- Return and display only a server-side reference such as:
  - blob pathname
  - internal upload ID
  - sanitized filename plus upload timestamp

Implementation notes:
- If `filePath` is still needed for follow-up processing, keep it in component state but do not render it.
- Once storage is private, raw public URLs should no longer be part of the normal admin workflow anyway.

Acceptance criteria:
- Admin pages no longer render direct Blob object URLs.
- Users can still continue the processing flow after upload.

## Ticket 3: Restrict snapshot export

Severity: Medium
Related finding:
- Snapshot export allows bulk client-side download of sensitive data

Goal:
- Prevent broad client-side export of full sensitive snapshots.

Recommended changes:
- Remove or gate the export action in [`app/SlideDeckVisualizer.jsx`](/abs/path/app/SlideDeckVisualizer.jsx:127).
- If export is still required:
  - move export generation to a protected server route
  - require admin authorization
  - log export events
  - export only the fields actually needed

Implementation notes:
- The current export serializes the full `snapshot` object, including `parsedRows`.
- Prefer exporting an aggregated report instead of raw row-level data.

Acceptance criteria:
- Non-admin users cannot export full snapshot JSON.
- Any retained export path is authenticated and scoped.

## Ticket 4: Add upload validation, request limits, and rate limiting

Severity: High
Related finding:
- No request-size, file-size, or rate-limit controls on upload/processing paths

Goal:
- Reduce abuse, denial-of-service risk, and storage-cost blowups on mutation paths.

Recommended changes:
- Add request validation to:
  - [`app/api/upload-csv/route.ts`](/abs/path/app/api/upload-csv/route.ts:1)
  - [`app/api/process-csv/route.ts`](/abs/path/app/api/process-csv/route.ts:1)
  - [`app/api/process-master/route.ts`](/abs/path/app/api/process-master/route.ts:1)
- Enforce:
  - maximum multipart body size
  - maximum CSV file size
  - allowed content type checks
  - required field shape validation for JSON bodies
- Add per-IP and per-user rate limiting for upload and processing routes.

Implementation notes:
- In `upload-csv`, reject empty files and oversized files before buffering them fully.
- In `process-csv` and `process-master`, validate request bodies with a schema validator instead of open-ended property access.
- Vercel-side rate limiting can be layered with application-side controls.
- If the project adopts auth, prefer rate limiting by authenticated user plus fallback IP limits.

Acceptance criteria:
- Oversized or malformed upload requests are rejected with `4xx`.
- Mutation routes cannot be spammed without hitting rate limits.
- Parsing work is bounded to expected input sizes.

## Ticket 5: Protect sensitive read APIs

Severity: High
Related finding:
- Read APIs expose sensitive organizational data without auth

Goal:
- Ensure only authorized users can access sensitive reporting data.

Recommended changes:
- Add auth and authorization checks to:
  - [`app/api/current-lists/route.ts`](/abs/path/app/api/current-lists/route.ts:1)
  - [`app/api/latest-snapshot/route.ts`](/abs/path/app/api/latest-snapshot/route.ts:1)
  - [`app/api/snapshot/route.ts`](/abs/path/app/api/snapshot/route.ts:1)
  - [`app/api/history/route.ts`](/abs/path/app/api/history/route.ts:1)
  - [`app/api/metrics/route.ts`](/abs/path/app/api/metrics/route.ts:1)
  - [`app/api/checkpoints/route.ts`](/abs/path/app/api/checkpoints/route.ts:1)
- Reduce the data returned to the frontend:
  - avoid row-level payloads unless strictly required
  - avoid returning emails where names or counts are sufficient
  - consider separate admin-only and viewer-safe endpoints

Implementation notes:
- The current dashboard loads full snapshot data and derives its own aggregates client-side.
- A safer design is to pre-aggregate on the server and return a minimal dashboard view model.
- `parsedRows` is the largest privacy concern and should not be broadly exposed.

Acceptance criteria:
- Sensitive read endpoints require authenticated access.
- The dashboard receives only the fields necessary for rendering.
- Row-level personal data is not returned to general viewers.

## Ticket 6: Upgrade vulnerable dependencies

Severity: High
Related finding:
- Dependency audit reported high-severity package vulnerabilities

Goal:
- Remove known vulnerable package versions from the deployed artifact.

Recommended changes:
- Update [`package.json`](/abs/path/package.json:1) and lockfile dependencies.
- Prioritize:
  - `next` from `16.0.7` to at least `16.2.4`
  - `@vercel/blob` to a version that resolves the `undici` advisory chain
- Reinstall dependencies and re-run:
  - `npm audit --json`
  - app build
  - regression tests

Implementation notes:
- Several advisories are transitive and may clear once `next` and `@vercel/blob` are upgraded.
- Review Next.js release notes for any behavioral changes between `16.0.7` and `16.2.4`.
- If a package cannot be upgraded immediately, document the compensating controls and residual risk.

Acceptance criteria:
- `npm audit` no longer reports the currently identified high-severity issues, or any remaining items are explicitly accepted and documented.
- The app builds cleanly after the upgrade.

## Ticket 7: Add authentication and authorization for admin pages and mutation routes

Severity: Critical
Related finding:
- No authentication or authorization on admin mutation routes

Goal:
- Protect only admin pages and mutation routes, while keeping the public dashboard accessible without login.

Recommended changes:
- Add middleware protection for:
  - `/admin/:path*`
  - `POST /api/upload-csv`
  - `POST /api/process-csv`
  - `POST /api/process-master`
- Use Vercel Authentication as the outer gate for those paths.
- Add auth checks to:
  - [`app/admin/upload/page.tsx`](/abs/path/app/admin/upload/page.tsx:1)
  - [`app/admin/upload-master/page.tsx`](/abs/path/app/admin/upload-master/page.tsx:1)
  - [`app/api/upload-csv/route.ts`](/abs/path/app/api/upload-csv/route.ts:1)
  - [`app/api/process-csv/route.ts`](/abs/path/app/api/process-csv/route.ts:1)
  - [`app/api/process-master/route.ts`](/abs/path/app/api/process-master/route.ts:1)
- Add a shared server-side helper such as `requireAdmin(request)` that:
  - reads authenticated identity from the Vercel-authenticated request
  - normalizes the email
  - checks membership in `ADMIN_EMAIL_ALLOWLIST`
  - returns `401` when unauthenticated
  - returns `403` when authenticated but not allowlisted
- Enforce authorization on the server before any Blob read/write operation.

Implementation notes:
- Middleware should block access early, but route handlers must still call `requireAdmin()` before any CSV parsing or Blob operation.
- `/admin/upload` and `/admin/upload-master` should no longer be reachable anonymously.
- Keep authorization centralized in one helper so all protected routes use the same policy.
- Do not add a full in-app session or end-user login surface in this ticket.
- Return `401` for unauthenticated requests and `403` for authenticated-but-forbidden requests.
- Add or document these env/config dependencies near the implementation:
  - `ADMIN_EMAIL_ALLOWLIST`
  - `BLOB_READ_WRITE_TOKEN`

Acceptance criteria:
- Public dashboard remains accessible without login.
- Anonymous users cannot access `/admin/*`.
- Anonymous users cannot call mutation APIs.
- Authenticated but non-allowlisted users receive `403`.
- Allowlisted admins can complete the upload and processing flow.

## Ticket 8: Make sensitive Blob data private

Severity: Critical
Related finding:
- Sensitive data is stored in public Blob objects

Goal:
- Make all sensitive Blob-backed artifacts private and remove all browser dependence on public Blob URLs.

Recommended changes:
- Change sensitive Blob writes from public to private for:
  - uploaded CSVs
  - snapshots
  - latest snapshot pointer
  - master list
  - history index
  - metrics artifacts
  - checkpoint index and checkpoint files
- Update Blob writes in:
  - [`lib/storage.ts`](/abs/path/lib/storage.ts:1)
  - [`lib/processCsvSnapshot.ts`](/abs/path/lib/processCsvSnapshot.ts:1)
  - [`lib/processMaster.ts`](/abs/path/lib/processMaster.ts:1)
  - [`lib/history.ts`](/abs/path/lib/history.ts:1)
  - [`lib/checkpointHistory.ts`](/abs/path/lib/checkpointHistory.ts:1)
- Replace `access: 'public'` with private storage where supported by the Blob usage pattern.
- Standardize internal references on Blob pathnames, not public URLs.
- `upload-csv` should return internal metadata such as `filePath`, but not `fileUrl`.
- `process-csv` and `process-master` should accept only internal Blob path references.
- Read objects server-side using the Blob token and return sanitized data through routes rather than exposing raw objects directly.

Implementation notes:
- The current code sometimes accepts either Blob path or Blob URL. After this patch, standardize on internal Blob path references only.
- All Blob reads must occur server-side using `BLOB_READ_WRITE_TOKEN`.
- Add a protected server route for CSV header detection so admin pages can still map columns without fetching uploaded files from the browser.
  - Input: `filePath`
  - Output: detected header list
- Public read APIs may remain public, but they must read private Blob data server-side and return only sanitized DTOs.
- Public API payloads must not expose:
  - emails
  - `parsedRows`
  - raw master records
  - Blob URLs
  - internal storage paths unless required by a protected admin flow
- Clarify in implementation notes and env/config docs that no `NEXT_PUBLIC_*` Blob access pattern should be required for admin ingestion after this change.
- Tickets 7 and 8 should be implemented together, because private Blob storage breaks the current browser-side header-detection flow unless the protected server-side replacement lands in the same change.

Acceptance criteria:
- Sensitive Blob objects are not anonymously retrievable by direct URL.
- Admin upload and processing still work without public Blob access.
- Public dashboard still works using server-shaped, sanitized API responses.
- Browser code no longer fetches uploaded CSVs directly from Blob.

## Suggested execution order

1. Ticket 7
2. Ticket 8
3. Ticket 5
4. Ticket 4
5. Ticket 6
6. Ticket 2
7. Ticket 3
8. Ticket 1

Rationale:
- The document is ordered by severity ascending as requested.
- The execution order above is separate and prioritizes closing the biggest exposure first.

## Assumptions

- The public dashboard is intentionally allowed to show presentation-safe reporting data.
- Admin access is email-based and centrally controlled through env configuration.
- Stored Blob schemas do not need a full redesign in this pass; access mode and route shaping are the primary changes.
- Tickets 7 and 8 should be implemented together because private Blob storage breaks the current browser-side header-detection flow unless the protected server-side replacement is added in the same change.
