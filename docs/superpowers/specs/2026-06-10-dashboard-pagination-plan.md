# Implementation Plan: Dashboard Pagination + Search & Filters

**Spec:** `2026-06-10-dashboard-pagination-design.md`  
**Date:** 2026-06-11

---

## Overview

4 new components + 1 modified file. Build bottom-up: stateless leaf components first, then stateful table components, then wire into `page.tsx` last.

---

## Step 1 — `Pagination.tsx`

**File:** `src/components/Pagination.tsx`

Build the stateless pagination controls.

```ts
interface PaginationProps {
  currentPage: number;
  hasNextPage: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSize: 25 | 50 | 100;
  onPageSizeChange: (size: 25 | 50 | 100) => void;
  totalCount: number;
}
```

- Display: `Showing {start}–{end} of {totalCount}`
- Prev button disabled when `currentPage === 1`
- Next button disabled when `!hasNextPage`
- Page size selector: 25 / 50 / 100
- Match existing Tailwind dark theme (slate/indigo palette from `page.tsx`)

**Checkpoint:** Render in isolation with hardcoded props, confirm prev/next disable states.

---

## Step 2 — `TableFilters.tsx`

**File:** `src/components/TableFilters.tsx`

Build the stateless filter bar.

```ts
interface Filters {
  searchQuery: string;
  status: string;       // "All" | "Pending Review" | "Under Review" | "Approved" | "Action Required"
  airline: string;      // "All" | specific airline name
  dateFrom: string;     // ISO date string, empty = unset
  dateTo: string;
}

interface TableFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  showAirlineFilter: boolean;   // false for airline staff
  airlineOptions: string[];     // list of airline names for dropdown
}
```

- Search input: debounce 300ms before calling `onChange`
- Clear button resets all fields to defaults
- Import `AIRLINE_NAMES` from `src/lib/utils.ts` for the airline dropdown options

**Checkpoint:** Confirm onChange fires correctly, Clear resets all fields.

---

## Step 3 — `SubmissionsTable.tsx`

**File:** `src/components/SubmissionsTable.tsx`

Stateful component owning filter state, cursor stack, and Firestore query.

```ts
interface SubmissionsTableProps {
  user: User;
  isAdmin: boolean;
  tenantName: string;
  onSelectSubmission: (submission: any) => void;
}
```

### Internal state

```ts
const [filters, setFilters] = useState<Filters>(defaultFilters);
const [pageSize, setPageSize] = useState<25|50|100>(25);
const [cursorStack, setCursorStack] = useState<DocumentSnapshot[]>([]);
const [currentPage, setCurrentPage] = useState(1);
const [rows, setRows] = useState<any[]>([]);
const [totalCount, setTotalCount] = useState(0);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

### Firestore query builder

Build the query from current filters:
```ts
let q = collection(db, "airline-upload");
if (!isAdmin) q = query(q, where("airlineName", "==", tenantName));
if (filters.status !== "All") q = query(q, where("status", "==", filters.status));
if (filters.airline !== "All") q = query(q, where("airlineName", "==", filters.airline));
if (filters.dateFrom) q = query(q, where("createdAt", ">=", Timestamp.fromDate(new Date(filters.dateFrom))));
if (filters.dateTo)   q = query(q, where("createdAt", "<=", Timestamp.fromDate(new Date(filters.dateTo))));
q = query(q, orderBy("createdAt", "desc"), limit(pageSize + 1));
if (cursorStack.length > 0) q = query(q, startAfter(cursorStack[cursorStack.length - 1]));
```

### Count query

Run `getCountFromServer()` on the same base query (without cursor/limit) on mount and on filter change.

### `hasNextPage` detection

Fetch `pageSize + 1` rows. If `rows.length > pageSize`, set `hasNextPage = true` and render only `rows.slice(0, pageSize)`.

### Filter reset rule

Any change to `filters` or `pageSize`: reset `cursorStack = []`, `currentPage = 1` before re-fetching.

### Navigation handlers

```ts
const handleNext = () => {
  setCursorStack(prev => [...prev, rows[pageSize - 1].__snapshot]);
  setCurrentPage(p => p + 1);
};
const handlePrev = () => {
  setCursorStack(prev => prev.slice(0, -1));
  setCurrentPage(p => p - 1);
};
```

Store `__snapshot` on each row when mapping Firestore docs.

### Client-side search

After fetching, filter `rows` by `filters.searchQuery` against `tailNumber`, `airlineName`, `file_name` fields (case-insensitive).

### Table columns

| Column | Source field | Notes |
|---|---|---|
| Tail # | `extractedData.tailNumber` | Bold |
| Airline | `airlineName` | Admin only |
| File | `file_name` | Truncate at 30 chars |
| Submitted | `createdAt` | Format as `YYYY-MM-DD` |
| Status | `status` | Colour-coded badge |
| AI Confidence | `extractedData.confidenceScore` | `%` suffix, colour by threshold |
| Action | — | "Review →" button → `onSelectSubmission` |

### Error / empty states

- Error: inline banner with Retry button (re-runs current query)
- Empty: "No submissions match your filters" + "Clear filters" link
- Stale cursor: catch error on `startAfter`, reset to page 1, show toast

**Checkpoint:** Test with admin account (all airlines visible), test with staff account (scoped), confirm filter reset clears cursor stack.

---

## Step 4 — `FleetTable.tsx`

**File:** `src/components/FleetTable.tsx`

Same structure as `SubmissionsTable` but queries `fleet-inventory`.

```ts
interface FleetTableProps {
  user: User;
  isAdmin: boolean;
  tenantName: string;
  onSelectAircraft: (aircraft: any) => void;
}
```

### Table columns

| Column | Source field | Notes |
|---|---|---|
| Tail # | `tailNumber` | Bold |
| Airline | `airlineName` | Admin only |
| Model | `aircraftModel` | — |
| Operational | `operationalStatus` | Badge |
| Compliance | `lastComplianceStatus` | Colour-coded badge |
| Last Synced | `lastUpdated` | Format as `YYYY-MM-DD` |
| Action | — | "View Report →" button → `onSelectAircraft` |

### Firestore query

```ts
let q = collection(db, "fleet-inventory");
if (!isAdmin) q = query(q, where("airlineName", "==", tenantName));
if (filters.status !== "All") q = query(q, where("lastComplianceStatus", "==", filters.status));
if (filters.airline !== "All") q = query(q, where("airlineName", "==", filters.airline));
q = query(q, orderBy("tailNumber", "asc"), limit(pageSize + 1));
if (cursorStack.length > 0) q = query(q, startAfter(cursorStack[cursorStack.length - 1]));
```

Status options for fleet: `"All" | "Passed" | "Action Required" | "Unknown"`.

**Checkpoint:** Confirm fleet tab shows correct per-tenant scoping.

---

## Step 5 — Wire into `page.tsx`

**File:** `src/app/page.tsx`

### Remove

- `submissions` state and its `useEffect` Firestore subscription
- `fleet` state and its `useEffect` Firestore subscription
- All card-list JSX for the Submissions tab
- All aircraft grid JSX for the Fleet Inventory tab
- `handleOpenReportFromAircraft` (moves into `FleetTable`)

### Keep

- Auth state: `user`, `isAdmin`, `tenantName`, `loading`
- Drawer state: `selectedSubmission`, `showDrawer`, `drawerTab`
- Comments state and handlers: `comments`, `commentInput`, `handlePostComment`
- Status update handler: `handleStatusChange`
- KPI strip (total fleet, compliance rate) — recalculate from counts provided by child tables via callbacks, or remove and let each table show its own KPIs

### Add

```tsx
// In the Submissions tab panel:
<SubmissionsTable
  user={user}
  isAdmin={isAdmin}
  tenantName={tenantName}
  onSelectSubmission={handleOpenDrawer}
/>

// In the Fleet Inventory tab panel:
<FleetTable
  user={user}
  isAdmin={isAdmin}
  tenantName={tenantName}
  onSelectAircraft={handleOpenReportFromAircraft}
/>
```

**Checkpoint:** Full smoke test — log in as admin, log in as airline staff, verify drawer still opens, comments still post, status still updates.

---

## Firestore Index Requirements

The compound queries introduced require composite indexes. Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "airline-upload",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "airlineName", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "airline-upload",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "fleet-inventory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "airlineName", "order": "ASCENDING" },
        { "fieldPath": "tailNumber", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy indexes before testing filtered queries: `firebase deploy --only firestore:indexes`

---

## Build Order Summary

| Step | File | Depends On |
|---|---|---|
| 1 | `Pagination.tsx` | Nothing |
| 2 | `TableFilters.tsx` | `src/lib/utils.ts` (airline list) |
| 3 | `SubmissionsTable.tsx` | Steps 1, 2 |
| 4 | `FleetTable.tsx` | Steps 1, 2 |
| 5 | `page.tsx` (wire-up) | Steps 3, 4 |
| 6 | `firestore.indexes.json` | Steps 3, 4 |
