# Thursday Terminology Change Proposal

## Summary

Replace the user-facing term `checkpoint` with clearer Thursday-based language in the product UI and docs. The goal is to make the concept understandable without requiring users to know the internal reporting model.

This proposal is intentionally docs-only. It does not change routes, storage paths, API names, or internal TypeScript identifiers.

## Problem

`Checkpoint` is accurate internally, but it is not intuitive in the dashboard context. Users are more likely to understand the feature if the wording directly references the Thursday-based reporting cycle already used by the system.

Example confusion:

- Users can see weekly repetition in names but may not understand what a `checkpoint` means.
- Labels like `Checkpoint Analytics` and `No checkpoint history` require extra explanation.

## Naming Options

### Option 1: `Thursday`

Examples:

- `1 Thursday`
- `Thursday Analytics`
- `No Thursday history`

Pros:

- Short
- Direct
- Easy to scan in compact UI

Cons:

- Slightly mechanical in narrative copy
- Can feel incomplete when used in headings

### Option 2: `Thursday Cycle` (Recommended)

Examples:

- `1 Thursday cycle`
- `Thursday Cycle Analytics`
- `No Thursday cycle history`

Pros:

- Best balance of clarity and reporting context
- Explains that this is a recurring reporting boundary, not just a date
- Works well in headers, descriptions, and tooltips

Cons:

- Slightly longer than `Thursday`

### Option 3: `Thursday Review`

Examples:

- `1 Thursday review`
- `Thursday Review Analytics`

Pros:

- More business-friendly
- Reads naturally in some executive contexts

Cons:

- Implies a review meeting or workflow that may not actually exist

### Option 4: `Weekly Thursday Snapshot`

Examples:

- `Thursday snapshot history`

Pros:

- Most explicit

Cons:

- Too long for repeated labels
- Heavy UI wording

## Recommendation

Use `Thursday Cycle` in titles and explanatory copy, and use `Thursday` in compact labels where space matters.

This gives the UI a plain-English meaning without overloading narrow components.

## Proposed Wording Strategy

### Titles and section headers

- `Checkpoint Analytics` -> `Thursday Cycle Analytics`
- `Checkpoint Trend` -> `Thursday Cycle Trend`
- `Checkpoint Exposure Trend` -> `Thursday Cycle Trend` or `Thursday Exposure Trend`

### Compact labels

- `Checkpoint Count` -> `Thursday Count`
- `Checkpoints` -> `Thursdays`
- `1 checkpoint` -> `1 Thursday`

### Empty states and helper text

- `No checkpoint history` -> `No Thursday cycle history`
- `repeat checkpoint exposure` -> `repeat Thursday exposure`

### Admin/review wording

- `checkpoint` -> `Thursday cycle`

## Non-Goals

This proposal does not rename:

- `/api/checkpoints`
- `/checkpoints`
- `checkpointId`
- `checkpointDate`
- `checkpointOrdinal`
- internal storage under `checkpoints/`

Those can remain unchanged unless there is a separate decision to align internal names later.

## Suggested Implementation Scope

If approved, apply the rename only to user-facing strings in:

- dashboard copy
- analytics page copy
- admin upload review copy
- metadata/description text
- docs that explain the feature to users

## Decision

Recommended default:

- `Thursday Cycle` for explanatory and navigational copy
- `Thursday` for compact labels
