# OCR Retry Fault Tolerance — Implementation Plan

**Date:** 2026-06-11  
**Spec:** `2026-06-11-ocr-retry-design.md`  
**File:** `functions/src/index.ts` (only file changed)

---

## Step 1 — Add `isRetryableError` helper

Insert after the imports, before `admin.initializeApp()`.

Classifies an unknown thrown value as retryable (transient) or terminal:
- Retryable: HTTP 429, 500, 502, 503, 504; network error codes `ECONNRESET`/`ETIMEDOUT`/`fetch failed`; empty Gemini response marker
- Terminal: everything else (400, 401, 403, Mammoth errors, etc.)

Detects status via `(err as any).status` (number) and network codes via `(err as any).cause?.code` and `err.message`.

---

## Step 2 — Add `retryWithBackoff` helper

Insert immediately after `isRetryableError`.

Signature:
```ts
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number
): Promise<{ result: T; retryCount: number }>
```

Logic:
- Loop `attempt` from 0 to `maxRetries` inclusive
- On success: return `{ result, retryCount: attempt }`
- On terminal error: rethrow immediately
- On retryable error and attempts remaining: `await sleep(baseDelayMs * 2 ** attempt)`, continue
- On retryable error and exhausted: attach `retryCount` to the error, rethrow

Add a local `sleep` helper: `const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))`.

---

## Step 3 — Initialize retry counters

At the top of the `try` block in `onAirlineUploadOCRTrigger`, before any async calls:

```ts
let fetchRetries = 0;
let geminiRetries = 0;
```

---

## Step 4 — Wrap Zone 1 (file download)

Replace the current bare `fetch(fileContentUrl)` block with:

```ts
const { result: buffer, retryCount: _fetchRetries } = await retryWithBackoff(
  async () => {
    const response = await fetch(fileContentUrl);
    if (!response.ok) {
      const err = Object.assign(
        new Error(`Failed to fetch file: ${response.status} ${response.statusText}`),
        { status: response.status }
      );
      throw err;
    }
    return Buffer.from(await response.arrayBuffer());
  },
  3, 1000
);
fetchRetries = _fetchRetries;
```

Remove the now-redundant manual `if (!response.ok)` check that existed before.

---

## Step 5 — Wrap Zone 2 (Gemini call + JSON parse)

Replace the current `ai.models.generateContent(...)` + `JSON.parse(textResponse)` block with:

```ts
const { result: extractedData, retryCount: _geminiRetries } = await retryWithBackoff(
  async () => {
    const responseResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
      },
    });
    if (!responseResult.text) {
      throw Object.assign(new Error("Empty response from Gemini"), { retryable: true });
    }
    return JSON.parse(responseResult.text);
  },
  3, 1000
);
geminiRetries = _geminiRetries;
```

Remove the now-redundant `if (!textResponse)` check and standalone `JSON.parse` that existed before.

Note: update `isRetryableError` to also check `(err as any).retryable === true` to handle the empty-response marker.

---

## Step 6 — Update failure catch block

In the outer `catch` block, add `retryCount` to both the Firestore update and the `ocr.failed` audit event:

**Firestore update** (add alongside `error_log`):
```ts
retryCount: fetchRetries + geminiRetries,
```

**`ocr.failed` audit metadata** (add alongside `errorMessage`):
```ts
retryCount: fetchRetries + geminiRetries,
```

---

## Step 7 — Update success path audit event

In the `ocr.completed` audit write, conditionally add `retryCount`:

```ts
metadata: {
  tailNumber: extractedData.tailNumber,
  confidenceScore: extractedData.confidenceScore,
  complianceStatus: extractedData.complianceStatus,
  ...(fetchRetries + geminiRetries > 0 && { retryCount: fetchRetries + geminiRetries }),
},
```

---

## Step 8 — TypeScript check

```bash
cd functions && npx tsc --noEmit
```

Must pass with no errors before done.

---

## Checklist

- [ ] `isRetryableError` added and covers all cases from spec
- [ ] `retryWithBackoff` added with correct backoff formula
- [ ] `sleep` helper present
- [ ] `fetchRetries` and `geminiRetries` initialized to 0
- [ ] Zone 1 wrapped, old manual fetch/ok check removed
- [ ] Zone 2 wrapped, old textResponse check and JSON.parse removed
- [ ] `retryCount` in Firestore failure write
- [ ] `retryCount` in `ocr.failed` audit metadata
- [ ] Conditional `retryCount` in `ocr.completed` audit metadata
- [ ] `tsc --noEmit` passes
