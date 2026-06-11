# Compliance Audit Trail + Export

**Date:** 2026-06-11
**Project:** SkyGate Portal (`gcp-tw-sandbox`)
**Status:** Approved for implementation

---

## Problem

Status changes, approvals, and admin actions leave no traceable record. There is no way to prove who approved a compliance submission, when OCR processing completed, or what the submission history looks like for a regulatory audit. There is also no way to export a submission's history for regulators.

---

## Goal

- Capture all meaningful events for every submission in a tamper-resistant Firestore log
- Surface that log to admins via a new Audit Trail tab in the existing drawer
- Allow admins to export a per-submission audit report as PDF or CSV

Airline staff see no audit log in the UI — export is the mechanism for regulatory review.

---

## Data Model

### Collection: `audit-log`

Top-level Firestore collection. One document per event.

```
audit-log/{eventId}
  submissionId:  string          // links to airline-upload/{id}
  airlineName:   string          // denormalised for future airline-wide queries
  action:        string          // see action types below
  actor: {
    uid:          string
    email:        string
    displayName:  string
  }
  timestamp:     Timestamp       // serverTimestamp() on client; admin.firestore.FieldValue.serverTimestamp() in functions
  metadata:      object          // flexible per action type
```

### Action Types

| Action | Who writes it | Metadata fields |
|---|---|---|
| `submission.created` | Client (`UploadForm.tsx`) | `{ fileName, fileType }` |
| `submission.status_changed` | Client (`page.tsx`) | `{ from, to }` |
| `submission.comment_added` | Client (`page.tsx`) | `{ commentPreview }` (first 80 chars) |
| `ocr.completed` | Cloud Function | `{ tailNumber, confidenceScore, complianceStatus }` |
| `ocr.failed` | Cloud Function | `{ errorMessage }` |

### Firestore Rules

```
match /audit-log/{eventId} {
  allow create: if request.auth != null;
  allow read:   if isAdmin();
  allow update, delete: if false;
}
```

Write-once by design — no event may be edited or deleted.

---

## Architecture

### Client-side Helper: `src/lib/audit.ts`

Single exported function used by all client write points:

```ts
export async function writeAuditEvent(event: {
  submissionId: string;
  airlineName: string;
  action: string;
  actor: { uid: string; email: string; displayName: string };
  metadata: object;
}): Promise<void>
```

Calls `addDoc(collection(db, "audit-log"), { ...event, timestamp: serverTimestamp() })`.

Failures are caught and logged to `console.error` — they never throw or block the caller.

### Cloud Function writes

`onAirlineUploadOCRTrigger` in `functions/src/index.ts` writes `ocr.completed` or `ocr.failed` directly via Admin SDK after the Gemini call resolves or rejects. Failures are logged to Cloud Logging and do not interrupt the OCR pipeline.

### Write Points

| Location | Event written | Trigger |
|---|---|---|
| `src/components/UploadForm.tsx` | `submission.created` | After `addDoc` to `airline-upload` succeeds |
| `src/app/page.tsx` → `handleStatusChange` | `submission.status_changed` | After `updateDoc` succeeds |
| `src/app/page.tsx` → `handlePostComment` | `submission.comment_added` | After `addDoc` to comments succeeds |
| `functions/src/index.ts` → `onAirlineUploadOCRTrigger` | `ocr.completed` or `ocr.failed` | After Gemini call resolves/rejects |

---

## UI Changes

### New tab in the drawer

Add a third tab `"audit"` alongside existing `"details"` and `"comments"` tabs.

- **Visible only when `isAdmin === true`** — tab is not rendered for airline staff
- Renders `<AuditTrail submissionId={selectedSubmission.id} airlineName={selectedSubmission.airlineName} />`

### `AuditTrail.tsx` component (`src/components/AuditTrail.tsx`)

Props: `submissionId: string`, `airlineName: string`

Behaviour:
- Fetches `audit-log` where `submissionId == props.submissionId`, ordered by `timestamp desc`, limit 50
- Renders a vertical timeline — one card per event
- Event card shows: action label, actor email, timestamp, metadata summary
- Color-coded dot per action type: green = approved, blue = comment, purple = OCR, slate = created, rose = failed
- Export CSV and Export PDF buttons at the top of the tab

Error states:
- Fetch fails → inline "Audit log unavailable" banner with Retry button
- 0 events → export buttons disabled with tooltip "No audit events recorded yet"

### Export functions (`src/lib/exportAudit.ts`)

Two exported functions:

**`exportAuditCSV(submission, events)`**
- Builds a CSV string: columns `Timestamp, Action, Actor, Details`
- Triggers a browser download via `URL.createObjectURL(new Blob(...))`
- Filename: `audit-{tailNumber}-{YYYY-MM-DD}.csv`

**`exportAuditPDF(submission, events)`**
- Uses `jsPDF` (new dependency)
- Layout: A4, header block (tail #, airline, file name, current status, export date), timeline table below
- Triggers browser download
- Filename: `audit-{tailNumber}-{YYYY-MM-DD}.pdf`

Both functions run entirely client-side — no Cloud Function needed.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Client audit write fails | `console.error`, silent to user — primary action already succeeded |
| Cloud Function audit write fails | Log to Cloud Logging, OCR pipeline continues unaffected |
| Audit trail fetch fails in drawer | Inline error banner with Retry — drawer remains usable |
| Export with 0 events | Buttons disabled, tooltip: "No audit events recorded yet" |

---

## Firestore Index

Querying `audit-log` by `submissionId` ordered by `timestamp` requires one composite index:

```json
{
  "collectionGroup": "audit-log",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "submissionId", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

Add to `firestore.indexes.json` and deploy with `firebase deploy --only firestore:indexes`.

---

## Out of Scope

- Airline-wide audit reports (across all submissions for one airline)
- Login / page-view event tracking
- Audit log visible to airline staff
- Automated retention / purge policy

---

## Files Affected

| File | Change |
|---|---|
| `src/lib/audit.ts` | New — shared `writeAuditEvent` helper |
| `src/lib/exportAudit.ts` | New — `exportAuditCSV` and `exportAuditPDF` |
| `src/components/AuditTrail.tsx` | New — timeline UI + export buttons |
| `src/app/page.tsx` | Add `"audit"` drawer tab; call `writeAuditEvent` in `handleStatusChange` and `handlePostComment` |
| `src/components/UploadForm.tsx` | Call `writeAuditEvent` after successful upload |
| `functions/src/index.ts` | Write `ocr.completed` / `ocr.failed` events via Admin SDK |
| `firestore.rules` | Add write-once rules for `audit-log` collection |
| `firestore.indexes.json` | Add `submissionId + timestamp` composite index |
| `package.json` | Add `jspdf` dependency |
