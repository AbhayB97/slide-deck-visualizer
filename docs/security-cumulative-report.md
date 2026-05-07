# Security Cumulative Report

Date: 2026-05-07
Audience: Product Owner
Sources compared:
- `docs/security-review.md`
- `docs/security-patches.md`
- Wegener security subagent findings from 2026-05-07

## Executive Summary

All three reviews point to the same primary business risk: the product currently exposes sensitive employee training data and privileged admin actions without sufficient server-side protection. The most urgent issues are not cosmetic. They create a credible path for unauthorized data access, unauthorized data changes, and accidental sharing of personally identifiable and compliance-related information.

The good news is that the reviews are directionally consistent. There is no major disagreement about what must be fixed first. The main product decisions now are about scope: whether the dashboard remains public, whether row-level data should ever be visible outside admins, and whether fairness/auditability for the draw flow is a business requirement.

## What Is Confirmed Across Reviews

- Admin upload and processing paths need server-side authentication and authorization before any Blob read/write occurs.
- Sensitive data is stored or exposed too broadly today, including employee names, emails, training status, and related session details.
- Blob-backed artifacts should be private, with access mediated by server routes rather than direct object URLs.
- Sensitive read APIs need tighter access control and data minimization.
- Upload and processing routes need request validation, size limits, and rate limiting.
- The current state creates real business risk in three categories:
  - privacy exposure of employee data
  - unauthorized manipulation of reporting data
  - operational cost or abuse through unprotected upload/processing endpoints

## Differences Or Gaps Between Reviews

### Wegener uniquely highlights

- Processing routes accept client-supplied `fileUrl` values, which creates an SSRF-style risk and allows ingestion from attacker-chosen URLs.
- The winner-selection flow is client-side and uses browser randomness, so it is not auditable if fairness matters operationally.

These are material gaps and should be added to the approved scope. They are not contradicted by the repo docs; they were simply missed there.

### `docs/security-review.md` uniquely highlights

- Dependency vulnerabilities in `next`, `@vercel/blob`, and transitive packages.
- Missing explicit security headers and browser hardening.
- Client-side bulk export of full snapshot data.
- Vercel deployment exposure context, including the difference between preview protection and public production aliases.

These are valid and worth addressing, but they are second-order compared with missing server-side auth and public data exposure.

### `docs/security-patches.md`

- This file is a remediation plan derived from `security-review.md`.
- It is broadly aligned with the confirmed risks above, but it does not currently include the SSRF issue or the draw-integrity/auditability issue from Wegener.

## Proposed Approval Scope

Approve the following as the minimum security remediation scope for this product:

1. Protect admin pages and mutation APIs with server-side authentication and admin authorization.
2. Make sensitive Blob artifacts private and stop exposing raw Blob URLs in the UI.
3. Restrict ingestion to trusted server-issued Blob paths only; do not accept arbitrary external `fileUrl` values.
4. Protect or redesign sensitive read APIs so they return only the minimum data needed for approved user roles.
5. Add upload/request validation, file-size limits, and rate limiting on mutation routes.
6. Remove or heavily gate raw snapshot export.
7. Upgrade vulnerable dependencies and re-run the security audit.
8. Add baseline browser/security headers.

Optional scope, only if the business cares about prize-draw defensibility:

9. Move winner selection server-side and add an audit trail.

## Open Decisions Requiring Product Owner Approval

- Should the dashboard remain publicly accessible, or should all reporting require login?
  - This is the most important product decision because it determines how much API and payload redesign is needed.
- If some dashboard access remains broad, what data is approved for non-admin viewers?
  - Counts and trends only, or named user-level data as well?
- Is raw snapshot export still a product requirement?
  - If yes, who is allowed to export, what fields are allowed, and does export need audit logging?
- Is draw fairness/auditability a formal requirement?
  - If yes, the current client-side draw should not be approved as final.
- Can historical Blob data be migrated to private storage as part of this approval, even if that requires compatibility work?
- Is there an approved identity model for admin access?
  - For example: Vercel Authentication plus an admin email allowlist, or another provider.

## Recommended Sequence

1. Approve the access-control model for admins and reporting users.
2. Implement admin auth plus private Blob storage together, because private storage will otherwise break the current upload/header-detection flow.
3. Remove arbitrary external file processing and lock ingest to trusted internal file references.
4. Reduce sensitive read API exposure and remove raw export or gate it behind admin-only server-side flows.
5. Add rate limiting, request validation, and abuse logging.
6. Upgrade vulnerable dependencies and verify build/test stability.
7. Add security headers and remaining browser hardening.
8. If required by the business, harden the draw flow with server-side selection and audit logging.

## Go/No-Go Recommendation

No-Go for broad production approval in the current state.

Go for a controlled remediation release if the approval scope above is accepted, with the following minimum gate before broader approval:

- admin and mutation routes are server-protected
- sensitive Blob artifacts are private
- arbitrary external file processing is blocked
- sensitive read exposure is reduced to an approved audience and payload

If those four gates are not closed, the product should be treated as carrying unresolved privacy and unauthorized-access risk.
