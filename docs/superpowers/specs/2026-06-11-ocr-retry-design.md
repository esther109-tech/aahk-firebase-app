# OCR Retry Fault Tolerance — Design Spec

**Date:** 2026-06-11  
**Project:** SkyGate Portal  
**Scope:** `functions/src/index.ts` only — no UI, no Firestore rule, no index changes

---

## Problem

The `onAirlineUploadOCRTrigger` Cloud Function calls Gemini 2.5 Flash to extract compliance metadata from uploaded files. Any failure (rate limit, transient network error, Gemini 5xx) immediately writes `status: "Processing Error"` to Firestore. There is no retry — the document stays in the error state permanently unless an admin manually intervenes via the Firestore console.

---

## Goals

- Automatically retry the OCR pipeline on transient errors before giving up.
- Distinguish transient errors (worth retrying) from permanent errors (fail immediately).
- Surface retry context (`retryCount`) in the existing `ocr.failed` audit event.
- Keep the retry logic fully contained in the Cloud Function — no new infrastructure.

---

## Non-Goals

- Manual retry button in the admin UI (not in scope).
- Firebase Cloud Functions built-in event retry (`retry: true`) — requires non-trivial idempotency refactoring.
- Cloud Tasks / task queue approach — unnecessary complexity for this use case.
- New Firestore fields visible in the portal UI beyond what already exists.

---

## Error Classification

A `isRetryableError(err: unknown): boolean` function is the gatekeeper.

### Retryable (transient)
| Condition | Examples |
|-----------|---------|
| HTTP 429 | Gemini quota exceeded, rate limit |
| HTTP 500 / 502 / 503 / 504 | Gemini server errors |
| Network errors | `fetch failed`, `ECONNRESET`, `ETIMEDOUT` |
| Empty Gemini response | `responseResult.text` is null/empty — model temporarily unavailable |

### Terminal (fail immediately, no retry)
| Condition | Examples |
|-----------|---------|
| HTTP 400 with safety/content block | Prompt blocked by Gemini safety filters |
| HTTP 400 bad request | Malformed prompt — retrying won't improve outcome |
| HTTP 401 / 403 | Invalid API key or permission denied |
| Mammoth extraction failure | Corrupt or unreadable `.docx` file |

Error type is detected by inspecting `err.status` (numeric HTTP code from the `@google/genai` SDK), `err.message`, and `err.cause?.code` for Node.js network errors.

---

## Retry Wrapper

```ts
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,   // 3
  baseDelayMs: number   // 1000
): Promise<{ result: T; retryCount: number }>
```

**Behaviour:**
1. Call `fn()`.
2. On success → return `{ result, retryCount }`.
3. On terminal error → throw immediately (no retry).
4. On retryable error and `attempt < maxRetries` → wait `baseDelayMs × 2^attempt` ms, increment attempt, go to step 1.
5. On retryable error and attempts exhausted → throw the last error with `retryCount` attached.

**Backoff timeline (3 retries, baseDelay = 1000ms):**
```
Attempt 1 → fail (retryable) → wait 1s
Attempt 2 → fail (retryable) → wait 2s
Attempt 3 → fail (retryable) → wait 4s
Attempt 4 → fail              → give up
Total added latency: ≤ 7s (well within 540s function timeout)
```

---

## Retry Zones in `onAirlineUploadOCRTrigger`

### Zone 1 — File download from Cloud Storage

```ts
const { result: buffer, retryCount: fetchRetries } = await retryWithBackoff(
  async () => {
    const response = await fetch(fileContentUrl);
    if (!response.ok) throw Object.assign(new Error(...), { status: response.status });
    return Buffer.from(await response.arrayBuffer());
  },
  3, 1000
);
```

Network blips fetching from GCS are transient. A 404 (file deleted) is treated as terminal via the HTTP status check.

### Zone 2 — Gemini generateContent + JSON parse

```ts
const { result: extractedData, retryCount: geminiRetries } = await retryWithBackoff(
  async () => {
    const responseResult = await ai.models.generateContent({ ... });
    if (!responseResult.text) throw new Error("Empty response from Gemini");
    return JSON.parse(responseResult.text);
  },
  3, 1000
);
```

Covers: rate limits (429), Gemini server errors (5xx), and occasional malformed JSON responses (which may resolve on retry).

### Not wrapped — Mammoth text extraction

```ts
const mammothResult = await mammoth.extractRawText({ buffer });
```

A corrupt `.docx` will not become valid on retry. Failures here propagate directly to the outer catch block.

---

## Total retry count

Both zone retry counts are initialized to `0` before the retry zones execute, so `totalRetries` is always defined even when a zone is never reached (e.g. Mammoth fails before Zone 2 runs).

```ts
let fetchRetries = 0;
let geminiRetries = 0;

// ... Zone 1 assigns fetchRetries, Zone 2 assigns geminiRetries ...

const totalRetries = fetchRetries + geminiRetries;
```

Passed into the failure/success audit event metadata.

---

## Audit Event Changes

### `ocr.failed` (existing, updated)
```ts
metadata: {
  errorMessage: String(err.message).slice(0, 500),
  retryCount: totalRetries   // NEW: 0–6 (up to 3 per zone)
}
```

### `ocr.completed` (existing, conditionally updated)
```ts
metadata: {
  tailNumber, confidenceScore, complianceStatus,
  ...(totalRetries > 0 && { retryCount: totalRetries })  // NEW: only when retries occurred
}
```

No new audit event types. `ocr.retrying` events are intentionally omitted — they would flood the audit log for intermediate state the user cannot act on.

---

## Firestore Document Changes

**On final failure** — one new field alongside existing `error_log` and `status`:
```
retryCount: number   // 0–6, informational only
```

**On success** — no new Firestore fields (retry context is in the audit log only).

**Status lifecycle — unchanged from user perspective:**
```
Upload created → ai_extracted: false, status: "Pending Review"
  ↓ Zone 1: fetch file        (up to 4 attempts)
  ↓ Zone 2: Gemini + parse    (up to 4 attempts)

✓ Success  → ai_extracted: true,  status: "Approved" | "Action Required"
✗ Exhausted → ai_extracted: true, status: "Processing Error", retryCount: N
```

---

## Files Changed

| File | Change |
|------|--------|
| `functions/src/index.ts` | Add `isRetryableError`, `retryWithBackoff`; wrap Zone 1 and Zone 2; update failure/success audit metadata; add `retryCount` to Firestore failure write |

No changes to: `firestore.rules`, `firestore.indexes.json`, `firebase.json`, any `src/` frontend files.
