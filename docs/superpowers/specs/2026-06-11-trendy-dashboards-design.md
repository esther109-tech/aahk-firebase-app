# Trendy Dashboards Design

**Date:** 2026-06-11
**Status:** Approved

## Overview

Replace the monolithic `page.tsx` (1067 lines) with a role-aware dashboard system. Admins get a sidebar-nav command center with compliance trends, airline leaderboard, and priority alerts. Airline staff get a focused hero + submission feed landing page. Visual style: Clean Light Glass (white/lavender, glassmorphism cards, gradient accents, soft shadows).

Chart library: `recharts` (compatible with React 19 + Tailwind v4, no conflicts).

---

## Section 1 — Route Structure & Architecture

```
src/app/
├── page.tsx                  → login form only; redirects authenticated users to /dashboard
├── dashboard/
│   ├── layout.tsx            → auth guard, role detection, chrome wrapper (sidebar for admins, minimal header for airline staff)
│   ├── page.tsx              → Overview (AdminOverview or AirlineOverview based on role)
│   ├── fleet/
│   │   └── page.tsx          → existing FleetTable (moved, unchanged)
│   ├── submissions/
│   │   └── page.tsx          → existing SubmissionsTable (moved, unchanged)
│   ├── trends/
│   │   └── page.tsx          → detailed compliance trend charts (admin only)
│   └── alerts/
│       └── page.tsx          → priority alert queue (admin only)
```

### New Components

| Component | Purpose |
|---|---|
| `DashboardLayout.tsx` | Sidebar nav, role-aware link visibility, auth guard |
| `AdminOverview.tsx` | KPI strip + trend chart + leaderboard + alerts feed |
| `AirlineOverview.tsx` | Hero compliance banner + submission feed |
| `ComplianceTrendChart.tsx` | Recharts `AreaChart`, weekly compliance % per airline |
| `AirlineLeaderboard.tsx` | Ranked rows with inline progress bar + delta badge |
| `AlertsFeed.tsx` | Sorted alert list with severity badges, links to audit drawer |

### Existing Components (moved, not rewritten)

`SubmissionsTable`, `FleetTable`, `AuditTrail`, `TableFilters`, `Pagination`, `UploadForm` — relocated into new page wrappers unchanged.

### Role Routing

`dashboard/layout.tsx` reads the authenticated user's email, calls `isUserAdmin()` and `getAirlineFromEmail()` from `src/lib/utils.ts`. Admin users see the full sidebar (5 links). Airline staff see a minimal header with no sidebar — their single page is `AirlineOverview`.

---

## Section 2 — New Data Model: `compliance-snapshots`

### Collection

**Document ID:** `{airlineName}_{YYYY-WW}` (e.g. `"Cathay Pacific_2026-W23"`)

```ts
{
  airlineName:       string,    // "Cathay Pacific"
  week:              string,    // "2026-W23"
  weekStart:         Timestamp, // Monday 00:00 UTC of that week
  totalAircraft:     number,    // fleet-inventory doc count for this airline
  compliantAircraft: number,    // count where lastComplianceStatus === "Passed"
  complianceRate:    number,    // (compliantAircraft / totalAircraft) * 100
  pendingReviews:    number,    // airline-upload docs still "Pending Review" or "Under Review"
  updatedAt:         Timestamp
}
```

### Cloud Function: `onFleetInventoryWrite`

- **Trigger:** Firestore `onDocumentWritten` on `fleet-inventory/{tailNumber}`
- **Logic:**
  1. Read `airlineName` from the changed document
  2. Query all `fleet-inventory` docs for that airline
  3. Count total, compliantAircraft (`lastComplianceStatus === "Passed"`), pendingReviews
  4. Compute `complianceRate`
  5. Upsert `compliance-snapshots/{airlineName}_{YYYY-WW}` with current values
- **Frequency:** Fires after every OCR completion (already writes to `fleet-inventory`)
- **No cron job needed** — document ID encodes the week, so concurrent writes merge naturally via upsert

### Alert Signals (client-side, no new collection)

| Alert Type | Query |
|---|---|
| Overdue review | `airline-upload` where `status` in `["Under Review", "Pending Review"]` and `createdAt < now - 48h` |
| Low confidence OCR | `airline-upload` where `extractedData.confidenceScore < 0.7` and `ai_extracted === true` |
| Compliance drop | Current week snapshot rate < previous week rate by >5% |

### Firestore Rules

```
match /compliance-snapshots/{doc} {
  allow read: if isAdmin();
  allow write: if false; // Cloud Function uses admin SDK
}
```

---

## Section 3 — Admin Dashboard

### KPI Strip

Four glassmorphism cards in a horizontal row:

| Card | Value | Delta Source |
|---|---|---|
| Total Fleet | Count of `fleet-inventory` docs | vs last week's snapshot sum |
| Overall Compliance | `(sum compliantAircraft / sum totalAircraft) × 100` across all airlines (current week) | vs previous week |
| Pending Reviews | Sum of `pendingReviews` across current week snapshots | vs last week |
| Active Alerts | Count of alert signals (see Section 2) | none |

Each card has a colored gradient underline (indigo, green, amber, red respectively) and a ▲/▼ delta badge.

### Compliance Trend Chart (`ComplianceTrendChart`)

- **Library:** `recharts` `AreaChart` inside `ResponsiveContainer`
- **X-axis:** Last 8 weeks (ISO week labels, e.g. "W16", "W17")
- **Y-axis:** Compliance % (0–100)
- **Series:** One colored area per airline (8 series), semi-transparent fill
- **Interaction:** Hover tooltip shows airline name, exact %, week. Clicking a series highlights it.
- **Legend:** Below chart, clicking toggles individual airline visibility
- **Data source:** Query `compliance-snapshots` where `weekStart >= 8 weeks ago`, grouped by airline

### Airline Leaderboard (`AirlineLeaderboard`)

Full-width table, sorted by current `complianceRate` descending:

| Column | Notes |
|---|---|
| Rank | 1–8, medal emoji for top 3 |
| Airline | Name |
| Compliance % | Bold, color-coded (green >90%, amber >75%, red below) |
| Progress bar | Inline, fills to compliance % |
| Pending Reviews | Count |
| WoW Delta | ▲/▼ vs previous week snapshot |

Clicking a row navigates to `/dashboard/trends?airline={airlineName}`.

### Priority Alerts Feed (`AlertsFeed`)

Card with sorted alert items, most severe first:

- **Red badge:** Compliance drop >5% WoW, or overdue review >72h
- **Amber badge:** Overdue review 48–72h, or low OCR confidence
- Each item shows: severity badge, tail number or airline name, description, relative timestamp
- Clicking opens the existing audit drawer for that submission

### Sidebar Nav

Five icon + label links (Lucide icons, consistent with existing icon usage):

| Link | Icon | Visibility |
|---|---|---|
| Overview | `LayoutDashboard` | All admins |
| Submissions | `FileText` | All admins |
| Fleet | `Plane` | All admins |
| Trends | `TrendingUp` | Admin only |
| Alerts | `Bell` + badge | Admin only |

Active link has an indigo background chip. Inactive links are muted.

---

## Section 4 — Airline Staff Dashboard

### Route

`/dashboard` renders `AirlineOverview` for airline staff users. No sidebar. Minimal header with airline name and sign-out button. Submissions and Fleet accessible via header text links if needed.

### Hero Banner (`AirlineOverview`)

Full-width gradient card (indigo → violet), Framer Motion fade-in on load:

- **Left:** Airline name in small caps, large compliance % from current week's snapshot, WoW delta badge
- **Right:** Two pill badges — active aircraft count, aircraft needing attention count
- If no snapshot exists yet (new airline), show a "Submit your first document to start tracking" state

### Submission Feed

White glassmorphism card below the banner:

- Header: "Recent Submissions" + `+ Upload` button (opens existing `UploadForm` modal)
- Live `onSnapshot` on `airline-upload` where `airlineName === userAirline`, ordered by `createdAt` desc, limit 10
- Each row: tail number (bold), document file name, relative timestamp, status badge (existing color coding)
- Clicking a row opens the existing audit drawer
- Empty state: illustrated prompt to upload first document

---

## Implementation Notes

- **No rewrites of existing components** — `SubmissionsTable`, `FleetTable`, `AuditTrail`, `UploadForm` move as-is into the new route pages
- **Auth guard in layout.tsx** — unauthenticated users redirect to `/` (login); eliminates the auth state logic currently duplicated in `page.tsx`
- **Recharts bundle size** — ~300KB minified; acceptable given current jsPDF dependency is similar weight
- **CJK rendering** — no new PDF export in dashboard; existing `exportAudit.ts` functions remain unchanged
- **Firestore reads** — `compliance-snapshots` is a small collection (max 8 airlines × 52 weeks = 416 docs/year); full collection reads are cheap
- **Week computation** — ISO week number utility needed in both Cloud Function and client; implement once in `src/lib/utils.ts` and import in function

---

## Out of Scope

- Mobile/responsive layout (portal is desktop-targeted)
- Real-time push notifications for alerts (polling on page load is sufficient)
- Historical snapshot backfill (trends accumulate from deployment date forward)
- Airline staff access to Trends or Alerts sections
