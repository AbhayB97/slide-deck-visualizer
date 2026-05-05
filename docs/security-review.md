# Security Review

Date: 2026-05-05
Reviewer: Codex
Scope: local codebase under `slide-deck-visualizer`, installed dependencies, and the Vercel project `slide-deck-visualizer`

## Executive Summary

The highest-risk issue is missing authentication and authorization around admin and data APIs. The current application exposes upload, processing, history, metrics, checkpoint, and current-list routes without any server-side access control, while the backing data contains employee names, emails, training status, and session metadata.

A second major issue is that sensitive JSON artifacts are written to Vercel Blob with `access: 'public'`, including full parsed snapshot contents and the master user list. Even if the UI only surfaces part of that data, the storage objects themselves are public URLs once written.

On the deployment side, preview deployments appear to be protected by Vercel Authentication, which is positive. However, the production deployment remains exposed through public aliases, and because the application has no internal auth gates, production exposure is still a material risk.

## Findings

### Critical: No authentication or authorization on admin mutation routes

Evidence:
- [`app/api/upload-csv/route.ts`](/abs/path/app/api/upload-csv/route.ts:7)
- [`app/api/process-csv/route.ts`](/abs/path/app/api/process-csv/route.ts:7)
- [`app/api/process-master/route.ts`](/abs/path/app/api/process-master/route.ts:6)
- [`app/admin/upload/page.tsx`](/abs/path/app/admin/upload/page.tsx:155)
- [`app/admin/upload-master/page.tsx`](/abs/path/app/admin/upload-master/page.tsx:150)

Impact:
- Any caller that can reach production can upload CSVs and trigger processing.
- An attacker could overwrite the weekly snapshot, overwrite the master list, poison reports, or inflate Blob/storage costs.
- Because the routes are server-side and use the Blob read/write token internally, no client secret is needed to abuse them.

Recommendation:
- Add server-side auth checks on all `/admin/*` pages and all mutation routes.
- Require role-based authorization for upload/process operations.
- Enforce route protection in middleware or inside each route handler, not only in the client UI.

### Critical: Sensitive data is stored in public Blob objects

Evidence:
- [`lib/storage.ts`](/abs/path/lib/storage.ts:26)
- [`lib/processCsvSnapshot.ts`](/abs/path/lib/processCsvSnapshot.ts:199)
- [`lib/processCsvSnapshot.ts`](/abs/path/lib/processCsvSnapshot.ts:208)
- [`lib/processMaster.ts`](/abs/path/lib/processMaster.ts:114)
- [`lib/history.ts`](/abs/path/lib/history.ts:67)

Stored data includes:
- Full parsed rows with `email`, `fullName`, `title`, `sentDate`, and `status`
- Master user list with names and emails
- Historical metrics and checkpoint rollups

Impact:
- Public Blob URLs can expose internal employee and compliance-style data.
- The admin UI explicitly displays uploaded Blob URLs after upload, increasing accidental sharing risk.
- Public blobs create a second exposure path even if app routes are later protected.

Recommendation:
- Change Blob storage for snapshots, master data, history, and checkpoint artifacts to private access.
- Serve sensitive objects only through authenticated server routes.
- Avoid returning raw Blob URLs to clients unless the object is intended to be public.

### High: Read APIs expose sensitive organizational data without auth

Evidence:
- [`app/api/current-lists/route.ts`](/abs/path/app/api/current-lists/route.ts:10)
- [`app/api/latest-snapshot/route.ts`](/abs/path/app/api/latest-snapshot/route.ts:16)
- [`app/api/snapshot/route.ts`](/abs/path/app/api/snapshot/route.ts:20)
- [`app/api/history/route.ts`](/abs/path/app/api/history/route.ts:9)
- [`app/api/metrics/route.ts`](/abs/path/app/api/metrics/route.ts:134)
- [`app/api/checkpoints/route.ts`](/abs/path/app/api/checkpoints/route.ts:58)
- [`app/SlideDeckVisualizer.jsx`](/abs/path/app/SlideDeckVisualizer.jsx:150)
- [`components/MegaGrid.tsx`](/abs/path/components/MegaGrid.tsx:129)

Impact:
- Unauthenticated callers can retrieve high-risk user lists, training completion history, checkpoint participation, and detailed per-user session data.
- This is a privacy and data-minimization problem even if the app is only intended for internal use.

Recommendation:
- Treat all reporting APIs as protected.
- Return only the minimum fields needed by the frontend.
- Consider aggregated counts instead of row-level personal data where possible.

### High: No request-size, file-size, or rate-limit controls on upload/processing paths

Evidence:
- [`app/api/upload-csv/route.ts`](/abs/path/app/api/upload-csv/route.ts:9)
- [`lib/storage.ts`](/abs/path/lib/storage.ts:19)
- [`lib/processCsvSnapshot.ts`](/abs/path/lib/processCsvSnapshot.ts:114)
- [`lib/processMaster.ts`](/abs/path/lib/processMaster.ts:54)

Impact:
- Large or repeated uploads can consume memory, CPU, and Blob costs.
- CSV parsing is done fully in memory.
- Attackers can repeatedly trigger parsing and storage writes.

Recommendation:
- Enforce max file size and content-length limits.
- Reject unexpected MIME types and oversized multipart bodies.
- Add per-route rate limits and, if appropriate, CAPTCHA or signed admin sessions.

### Medium: No explicit security headers or route-hardening configuration

Evidence:
- [`next.config.ts`](/abs/path/next.config.ts:3)
- No `middleware.ts` file is present in the repo.

Impact:
- There is no repo-level evidence of CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`.
- This increases reliance on platform defaults and leaves the admin UI more exposed to framing or overly broad browser capabilities.

Recommendation:
- Add explicit security headers in `next.config.ts` or middleware.
- At minimum define CSP, frame protection, referrer policy, and permissions policy.

### Medium: Admin pages disclose raw uploaded Blob URLs in the UI

Evidence:
- [`app/admin/upload/page.tsx`](/abs/path/app/admin/upload/page.tsx:193)
- [`app/admin/upload-master/page.tsx`](/abs/path/app/admin/upload-master/page.tsx:188)

Impact:
- Users can easily copy and redistribute raw storage URLs.
- This increases accidental exposure and makes public-object access easier to exploit.

Recommendation:
- Stop showing direct storage URLs for sensitive uploads.
- Show an internal reference ID instead.

### Medium: Snapshot export allows bulk client-side download of sensitive data

Evidence:
- [`app/SlideDeckVisualizer.jsx`](/abs/path/app/SlideDeckVisualizer.jsx:127)

Impact:
- Any user with access to the dashboard can export the full loaded snapshot as JSON.
- That snapshot includes parsed rows, names, emails, titles, dates, and statuses.

Recommendation:
- Remove export for non-admin users.
- If export is required, provide a scoped server-generated export with auth and audit logging.

## Dependency Audit

Command run on 2026-05-05:

```bash
npm audit --json
```

Summary:
- 9 total vulnerabilities
- 5 high
- 4 moderate

Highest-priority package issues:
- `next@16.0.7` is behind the audit-recommended fix `16.2.4` and is flagged for multiple DoS and request-handling issues.
- `@vercel/blob@2.0.0` pulls in vulnerable `undici`.
- Additional high-severity issues exist in transitive packages including `flatted`, `minimatch`, and `picomatch`.

Recommendation:
- Upgrade `next` to at least `16.2.4`.
- Update `@vercel/blob` to a version that resolves the `undici` advisory chain.
- Re-run `npm audit` after dependency refresh and document any accepted residual risk.

## Vercel Deployment Review

### Confirmed observations

Project inspection on 2026-05-05 showed:
- Project: `slide-deck-visualizer`
- Project ID: `prj_xZIMWxwjNv8wPGOukMfi3Yk0JVQe`
- Framework: Next.js
- Root directory: `.`
- Node.js version: `24.x`

Production deployment inspection on 2026-05-05 showed:
- Deployment ID: `dpl_87ewNQyt5ZeFbCkPZXzqGDi9PhT7`
- Created: 2026-04-28 13:13:08 EDT
- Target: `production`
- Aliases include:
  - `https://vretta-msa-dashboard.vercel.app`
  - `https://slide-deck-visualizer.vercel.app`

Recent deployment listing on 2026-05-05 showed:
- Multiple preview deployments remain addressable by unique preview URLs.
- At least one failed preview deployment existed on 2026-04-01.

### Positive finding

Preview deployment probing returned a Vercel Authentication interstitial rather than open content. That strongly suggests preview deployments are protected by Vercel Authentication.

### Risks and gaps

1. Production is still risky even with preview auth.
Because the app has no internal auth checks, a public production alias exposes the sensitive API and admin surfaces directly.

2. I could not verify firewall/WAF settings from the connected Vercel app.
The Vercel MCP project-inspection calls returned `403 Forbidden`, so firewall, managed rules, bot protection, and IP restrictions were not directly confirmed.

3. Production probing returned `429 Too Many Requests` from this environment.
That indicates some rate-limit or anti-abuse behavior is active, which is better than no control, but it is not a substitute for authentication and it does not prove sensitive endpoints are properly protected.

4. Build logs are visible to authorized project users.
Inspection of the failed 2026-04-01 preview deployment showed branch names, commit IDs, file paths, and compiler errors. No secret values were observed in the sampled logs, but teams should still avoid logging sensitive data during build or runtime.

### Vercel recommendations

1. Keep Vercel Authentication enabled for preview deployments.
2. Add application-layer auth for production; do not rely on preview auth alone.
3. Review Vercel Firewall settings and enable managed OWASP/WAF protections where available.
4. Add explicit rate limits for mutation and report APIs.
5. Review which production aliases are necessary and remove unused public aliases.
6. Verify environment variables are scoped correctly across `production`, `preview`, and `development`.
7. Consider restricting admin functionality behind Vercel Authentication or an identity provider even in production.

## Prioritized Remediation Plan

1. Add authentication and authorization to all admin pages and all `/api/*` routes returning or mutating sensitive data.
2. Make Blob-stored snapshots, master lists, history, and checkpoint files private.
3. Remove direct Blob URLs from UI responses.
4. Add upload size limits, request validation, and rate limiting.
5. Upgrade `next` and `@vercel/blob`, then re-run audit.
6. Add explicit security headers and, if appropriate, middleware-based route guards.
7. Review Vercel Firewall, alias exposure, and environment-variable scoping in the Vercel dashboard.

## Method Notes

This review combined:
- Static source review of the local repository
- `npm audit --json` on the installed dependency graph
- Vercel CLI inspection of the linked account and deployments on 2026-05-05

Items marked as confirmed are based on direct repository or CLI evidence. Items described as likely, inferred, or not verified reflect tooling access limits encountered during the Vercel-side review.
