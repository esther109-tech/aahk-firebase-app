# Dashboard Pagination + Search & Filters

**Date:** 2026-06-10  
**Project:** SkyGate Portal (`gcp-tw-sandbox`)  
**Status:** Approved for implementation

---

## Problem

The Submissions and Fleet Inventory tabs load all Firestore records into memory and render them as a scrollable card list. In production, with hundreds of submissions across multiple airlines, this creates an unusable wall of content with no way to find specific records. There is no search, no filtering, and no pagination.

---

## Goal

Replace the card scroll in both tabs with a compact paginated table that includes search and filter controls. Both admin users (cross-airline view) and airline staff (tenant-scoped view) benefit from this change.

---

## Architecture & Data Flow

### Pagination Strategy

Firestore cursor-based pagination using `.limit(n).startAfter(lastDoc)`.

- Each table component maintains a `cursorStack: DocumentSnapshot[]` — the last document snapshot of each visited page.
- **Forward**: append the last doc of the current page to the stack, fetch next batch.
- **Backward**: pop the stack, fetch the previous batch using the new top cursor.
- **Any filter change**: reset `cursorStack` to `[]` and `currentPage` to `1` — stale cursors from a previous query shape must never be reused.

### Filter Strategy

Structured filters (`status`, `airlineName`, `createdAt` range) are applied as Firestore `where()` clauses — they hit the server and reduce the fetched dataset.

Free-text search (`searchQuery`) runs client-side against the 25 currently fetched rows. Firestore does not support full-text search natively; filtering 25 rows in-memory is instant and sufficient.

Changing a Firestore filter resets pagination. Changing `searchQuery` does not.

### Tenant Scoping

- **Airline staff**: `filterAirline` is locked to their own airline (derived from email domain). The airline dropdown is hidden.
- **Admins**: all airlines selectable; default is "All Airlines".

---

## Component Breakdown

All new components live in `src/components/`.

### `SubmissionsTable.tsx`

Replaces the card list in the Submissions tab.

- Owns filter state, cursor stack, and Firestore real-time subscription.
- Renders `<TableFilters>` and `<Pagination>` internally.
- Exposes `onSelectSubmission(submission)` callback — fires when a row's "Review →" button is clicked, opening the existing drawer in `page.tsx`.
- Columns: Tail #, Airline (admin only), File Name, Submitted Date, Status (badge), AI Confidence, Action.

### `FleetTable.tsx`

Replaces the aircraft grid in the Fleet Inventory tab.

- Same structure as `SubmissionsTable` but queries `fleet-inventory`.
- Exposes `onSelectAircraft(aircraft)` callback.
- Columns: Tail #, Airline (admin only), Aircraft Model, Operational Status, Compliance Status, Last Synced, Action.

### `TableFilters.tsx`

Shared filter bar used by both tables.

- Props: `filters` (current values), `onChange(filters)` callback, `showAirlineFilter: boolean`.
- Controls: search input, status dropdown, airline dropdown (admin only), date-from/date-to inputs, Clear button.
- Stateless — all state lives in the parent table component.

### `Pagination.tsx`

Reusable pagination controls.

- Props: `currentPage`, `hasNextPage: boolean`, `onPrev`, `onNext`, `pageSize`, `onPageSizeChange`, `totalCount: number`.
- Displays: "Showing 1–25 of 247 submissions". Total count comes from a `getCountFromServer()` query run once on mount and on every filter change.
- `hasNextPage` is determined by fetching `pageSize + 1` rows — if the result length exceeds `pageSize`, a next page exists (the extra row is never rendered).
- Page size options: 25, 50, 100.
- Stateless.

### `page.tsx` changes

Delegates Firestore query logic and filter state to `SubmissionsTable` and `FleetTable`. Retains only:
- Auth state (`user`, `isAdmin`, `tenantName`)
- Drawer state (`selectedSubmission`, `showDrawer`)
- Comments and status-update handlers (unchanged)

---

## State Model

Each table component owns:

```ts
filterStatus: string          // "All" | "Pending Review" | "Under Review" | "Approved" | "Action Required"
filterAirline: string         // "All" | airline name (admin only)
filterDateFrom: Date | null
filterDateTo: Date | null
searchQuery: string           // client-side text filter, no Firestore re-fetch
pageSize: 25 | 50 | 100
cursorStack: DocumentSnapshot[]
currentPage: number
isLoading: boolean
error: string | null
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Firestore query fails | Inline error banner inside the table with a Retry button. No full-page crash. |
| No results after filtering | Empty state: "No submissions match your filters" + "Clear filters" link. |
| Cursor becomes stale (document deleted mid-session) | Catch Firestore error on `startAfter()`, reset to page 1, show toast "Results refreshed." |

Existing drawer, comment posting, and status-update logic are unaffected.

---

## Out of Scope

- Full-text search across all pages (Algolia/Typesense integration).
- Export to CSV/PDF.
- Column sorting (can be added in a follow-up).
- Mobile-responsive table layout.

---

## Files Affected

| File | Change |
|---|---|
| `src/app/page.tsx` | Remove Firestore subscription logic and card-list JSX for both tabs; render `<SubmissionsTable>` and `<FleetTable>` |
| `src/components/SubmissionsTable.tsx` | New |
| `src/components/FleetTable.tsx` | New |
| `src/components/TableFilters.tsx` | New |
| `src/components/Pagination.tsx` | New |
