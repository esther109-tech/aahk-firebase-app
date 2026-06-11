# Trendy Dashboards — Implementation Plan

**Date:** 2026-06-11
**Spec:** `2026-06-11-trendy-dashboards-design.md`

---

## Phase 1 — Setup & Utilities

### Step 1: Install recharts
```bash
npm install recharts
```

### Step 2: Create directory structure
```
src/app/dashboard/
src/app/dashboard/fleet/
src/app/dashboard/submissions/
src/app/dashboard/trends/
src/app/dashboard/alerts/
```

### Step 3: Add ISO week utility to `src/lib/utils.ts`
Add `getISOWeek(date: Date): string` returning `"YYYY-WNN"` (e.g. `"2026-W23"`).
Add `getWeekStart(date: Date): Date` returning the Monday 00:00 UTC of the given date's week.
Used by both the Cloud Function and client-side snapshot queries.

---

## Phase 2 — Dashboard Layout & Routing

### Step 4: Create `src/app/dashboard/layout.tsx`
- Import `useAuthState` (or equivalent Firebase auth hook)
- Unauthenticated users: redirect to `/`
- Call `isUserAdmin()` and `getAirlineFromEmail()` from `src/lib/utils.ts`
- Admin users: render `<DashboardSidebar>` on the left + `{children}` on the right
- Airline staff: render minimal header (airline name + sign-out button) + `{children}` below
- Pass `isAdmin` and `airlineName` as context to children via React context or search params

### Step 5: Create `src/components/DashboardSidebar.tsx`
Five nav links using Next.js `<Link>` and Lucide icons:

| Label | Icon | Path | Visibility |
|---|---|---|---|
| Overview | `LayoutDashboard` | `/dashboard` | All |
| Submissions | `FileText` | `/dashboard/submissions` | All |
| Fleet | `Plane` | `/dashboard/fleet` | All |
| Trends | `TrendingUp` | `/dashboard/trends` | Admin only |
| Alerts | `Bell` | `/dashboard/alerts` | Admin only |

Active link: indigo background chip. Inactive: muted gray.
Width: fixed 64px (icon + label below), collapses gracefully.
Alerts link shows a red badge with count when alerts exist.

### Step 6: Update `src/app/page.tsx`
- Keep `<LoginForm>` rendering for unauthenticated users
- Add `useEffect`: if user is authenticated, `router.push('/dashboard')`
- Remove all dashboard/analytics/table/drawer logic (moves to new pages)
- File should shrink from 1067 lines to ~60 lines

---

## Phase 3 — Migrate Existing Pages

### Step 7: Create `src/app/dashboard/submissions/page.tsx`
- Move the submissions tab content from `page.tsx` into this file
- Import and render `<SubmissionsTable>` with its existing props/state
- Import and render the audit drawer (`AuditDrawer`) alongside it
- No changes to `SubmissionsTable.tsx` itself

### Step 8: Create `src/app/dashboard/fleet/page.tsx`
- Move the fleet tab content from `page.tsx` into this file
- Import and render `<FleetTable>` with its existing props/state
- No changes to `FleetTable.tsx` itself

---

## Phase 4 — New Data Layer

### Step 9: Add Firestore security rules for `compliance-snapshots`
In `firestore.rules`, add:
```
match /compliance-snapshots/{doc} {
  allow read: if isAdmin();
  allow write: if false;
}
```

### Step 10: Create `functions/src/snapshotTrigger.ts`
Export `onFleetInventoryWrite`:
- Trigger: `onDocumentWritten('fleet-inventory/{tailNumber}', ...)`
- Read `airlineName` from the changed document (after state)
- Query all `fleet-inventory` docs where `airlineName` matches
- Count `totalAircraft`, `compliantAircraft` (`lastComplianceStatus === 'Passed'`), `pendingReviews`
- Compute `complianceRate = (compliantAircraft / totalAircraft) * 100`
- Compute `week` using `getISOWeek(new Date())` and `weekStart` using `getWeekStart(new Date())`
- Upsert `compliance-snapshots/{airlineName}_{week}` via `set(..., { merge: true })`
- Handle edge case: if `totalAircraft === 0`, set `complianceRate = 0`

### Step 11: Export new function from `functions/src/index.ts`
Add `export { onFleetInventoryWrite } from './snapshotTrigger'`

---

## Phase 5 — New Chart & Data Components

### Step 12: Create `src/components/ComplianceTrendChart.tsx`
Props: `snapshots: ComplianceSnapshot[]` (last 8 weeks, all airlines)

- Group snapshots by `airlineName`, sort by `weekStart`
- Build Recharts data array: `[{ week: 'W16', 'Cathay Pacific': 91, 'Emirates': 99, ... }]`
- Render `<ResponsiveContainer width="100%" height={240}>`
  - `<AreaChart>` with `data`
  - `<XAxis dataKey="week" />`
  - `<YAxis domain={[0, 100]} tickFormatter={v => v + '%'} />`
  - `<Tooltip formatter={(v) => v + '%'} />`
  - `<Legend />` — clicking toggles series
  - One `<Area>` per airline with a distinct color (use a fixed palette of 8 colors)
  - `type="monotone"`, `strokeWidth={2}`, semi-transparent fill
- If fewer than 2 weeks of data: render a placeholder card ("Trends will appear after the first week of submissions")

### Step 13: Create `src/components/AirlineLeaderboard.tsx`
Props: `snapshots: ComplianceSnapshot[]` (current week only, one per airline)

- Sort by `complianceRate` descending
- Render a table with columns: Rank, Airline, Compliance %, progress bar, Pending Reviews, WoW delta
- Rank: medal emoji for top 3 (🥇🥈🥉), number for rest
- Compliance % color: green if ≥90, amber if ≥75, red below
- Progress bar: `<div>` with `width: {rate}%`, same color as %
- WoW delta: compare current week `complianceRate` to previous week's snapshot for same airline; show ▲/▼ with value
- Clicking a row: `router.push('/dashboard/trends?airline=' + encodeURIComponent(airlineName))`

### Step 14: Create `src/components/AlertsFeed.tsx`
Props: `submissions: Submission[]` (all unresolved), `snapshots: ComplianceSnapshot[]` (last 2 weeks)

Compute alerts client-side:
1. Overdue review: `status` in `["Under Review", "Pending Review"]` and `createdAt < now - 48h` → red if >72h, amber if 48–72h
2. Low confidence OCR: `ai_extracted === true` and `extractedData.confidenceScore < 0.7` → amber
3. Compliance drop: current week rate < previous week rate by >5% → red

Sort: red first, then amber, then by age.

Render as a card list. Each item:
- Severity badge (red/amber pill)
- Tail number or airline name (bold)
- Short description (e.g. "Overdue review — 3 days", "Compliance drop ↓8% — Japan Airlines")
- Relative timestamp
- Clicking an overdue/OCR alert: open audit drawer for that submission
- Clicking a compliance drop alert: navigate to `/dashboard/trends?airline=X`

---

## Phase 6 — Admin Overview Page

### Step 15: Create `src/components/AdminOverview.tsx`
Fetch on mount (all via Firestore client SDK):
- `compliance-snapshots` where `weekStart >= 8 weeks ago` — for trend chart
- Current week snapshots per airline — for leaderboard and KPI strip
- Unresolved submissions (status not Approved) — for alerts

**KPI Strip** — four glassmorphism cards in a row:
1. Total Fleet: sum of `totalAircraft` from current week snapshots
2. Overall Compliance: `(sum compliantAircraft / sum totalAircraft) × 100` formatted to 1 decimal
3. Pending Reviews: sum of `pendingReviews` from current week snapshots
4. Active Alerts: count of computed alerts from `<AlertsFeed>` logic

Each card has: label, value, colored gradient underline, delta badge vs previous week.
Framer Motion `fadeInUp` stagger on mount (consistent with existing animations).

Below the strip, in order:
1. `<ComplianceTrendChart>` (full width)
2. Two columns: `<AirlineLeaderboard>` (left, 60%) + `<AlertsFeed>` (right, 40%)

### Step 16: Create `src/app/dashboard/page.tsx`
- Read role from layout context
- If admin: render `<AdminOverview />`
- If airline staff: render `<AirlineOverview airlineName={airlineName} />`

---

## Phase 7 — Airline Staff Overview

### Step 17: Create `src/components/AirlineOverview.tsx`
Props: `airlineName: string`

**Hero Banner** — gradient card (indigo → violet), Framer Motion fade-in:
- Left: airline name (small caps, muted), large compliance % from current week snapshot, WoW delta badge
- Right: two pills — active aircraft count, aircraft needing attention (status not "Active")
- If no snapshot: "Submit your first document to start tracking compliance"

**Submission Feed** below banner:
- Header: "Recent Submissions" label + `<button>` that opens `<UploadForm>` modal
- Live `onSnapshot` on `airline-upload` where `airlineName === props.airlineName`, ordered by `createdAt` desc, limit 10
- Each row: tail number (bold), file name, relative timestamp, status badge
- Clicking a row: open existing audit drawer
- Empty state: illustrated prompt (dashed border card, upload icon, "No submissions yet")

---

## Phase 8 — Admin-Only Section Pages

### Step 18: Create `src/app/dashboard/trends/page.tsx`
- Read optional `?airline=` query param
- Fetch all `compliance-snapshots` (no date limit — full history)
- If airline param set: highlight that airline's series, dim others
- Render `<ComplianceTrendChart>` (full width, taller — `height={400}`)
- Below: data table showing raw snapshot values per week per airline (sortable)
- Breadcrumb: Overview → Trends

### Step 19: Create `src/app/dashboard/alerts/page.tsx`
- Fetch all unresolved submissions + last 2 weeks of snapshots
- Render `<AlertsFeed>` (full-width, all alerts visible — no truncation)
- Group alerts by severity (red group, then amber group)
- Breadcrumb: Overview → Alerts

---

## Phase 9 — Deploy & Verify

### Step 20: Deploy Cloud Functions
```bash
cd functions && npm run deploy
```
Verify `onFleetInventoryWrite` appears in Firebase Console → Functions.
Trigger a test by uploading a document and confirming a snapshot document is created in `compliance-snapshots`.

### Step 21: Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```

### Step 22: Local verification checklist
- [ ] Login redirects to `/dashboard`
- [ ] Admin sees sidebar with all 5 links
- [ ] Airline staff see minimal header, no sidebar
- [ ] Submissions and Fleet pages load existing tables correctly
- [ ] KPI cards show correct values
- [ ] Trend chart renders (or shows placeholder if <2 weeks of data)
- [ ] Leaderboard rows are sorted correctly
- [ ] Alerts feed surfaces at least one alert from test data
- [ ] Hero banner shows compliance % for airline staff
- [ ] Submission feed shows live updates
- [ ] Upload button opens UploadForm modal
- [ ] Audit drawer still opens from submission rows

---

## File Checklist

### New files
- `src/app/dashboard/layout.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/submissions/page.tsx`
- `src/app/dashboard/fleet/page.tsx`
- `src/app/dashboard/trends/page.tsx`
- `src/app/dashboard/alerts/page.tsx`
- `src/components/DashboardSidebar.tsx`
- `src/components/AdminOverview.tsx`
- `src/components/AirlineOverview.tsx`
- `src/components/ComplianceTrendChart.tsx`
- `src/components/AirlineLeaderboard.tsx`
- `src/components/AlertsFeed.tsx`
- `functions/src/snapshotTrigger.ts`

### Modified files
- `src/app/page.tsx` — strip to login-only + auth redirect
- `src/lib/utils.ts` — add `getISOWeek`, `getWeekStart`
- `functions/src/index.ts` — export `onFleetInventoryWrite`
- `firestore.rules` — add `compliance-snapshots` rule
- `package.json` — add `recharts` dependency
