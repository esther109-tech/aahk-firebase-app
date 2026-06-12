# Deterministic Confidence Score & Investigation Agent — Implementation Plan

**Date:** 2026-06-12
**Spec:** `docs/superpowers/specs/2026-06-12-confidence-score-design.md`

---

## Step 1 — Remove `confidenceScore` from OCR pipeline

**File:** `functions/src/index.ts`

1. Remove `confidenceScore: { type: "INTEGER" }` from `responseSchema.properties`.
2. Remove `"confidenceScore"` from `responseSchema.required`.
3. Remove line 274: `5. Set 'confidenceScore' (0-100) reflecting...` from `systemInstruction`.
4. Remove `confidenceScore: extractedData.confidenceScore` from the `ocr.completed` audit event metadata.

No other changes to `index.ts` at this step.

---

## Step 2 — Create `functions/src/investigation.ts`

New file. Export one Cloud Function and keep all helpers internal.

### 2a — Types

```ts
interface InvestigationRound {
  round: number;
  score: number;
  open_questions: string[];
}

interface InvestigationState {
  score: number;
  round: number;
  status: "investigating" | "complete" | "degrading" | "max_rounds";
  open_questions: string[];
  scores_per_round: number[];
  adversarial?: {
    redTeam: string[];
    confirmed_issues: string[];
    cleared_issues: string[];
  };
  draft_actions: DraftAction[];
  completedAt: admin.firestore.FieldValue;
}

interface DraftAction {
  type: "jira.comment" | "jira.transition" | "jira.assign";
  payload: Record<string, unknown>;
  status: "draft" | "executed";
}
```

### 2b — `computeScore(extracted, openQuestions)`

Pure function, no I/O:

```ts
function computeScore(
  extracted: Record<string, any>,
  openQuestions: string[]
): number {
  const REQUIRED = ["airlineName", "aircraftModel", "tailNumber", "updateDate", "complianceReason"];
  const detectedFields: any[] = extracted.detectedFields ?? [];

  const fieldsScore = Math.round(Math.min(detectedFields.length, 30) / 30 * 34);
  const complianceScore = { "Passed": 33, "Action Required": 17, "Unknown": 0 }[
    extracted.complianceStatus as string
  ] ?? 0;
  const nonUnknownCount = REQUIRED.filter(
    f => extracted[f] && extracted[f] !== "Unknown"
  ).length;
  const completenessScore = Math.round((nonUnknownCount / 5) * 33);
  const penalty = Math.min(openQuestions.length * 5, 20);

  return Math.max(0, fieldsScore + complianceScore + completenessScore - penalty);
}
```

### 2c — `callGeminiInvestigation(extracted, openQuestions, geminiApiKey)`

Single Gemini call for one investigation round. Returns `{ updatedExtracted, openQuestions }`.

- System prompt: re-extraction instructions + guard note: *"Score is {n}/100. Open questions: {list}. You indicated completion but confidence is below the bar. Re-examine the document and resolve as many open questions as possible."*
- Uses the same `responseSchema` as OCR minus `confidenceScore`, plus a new `open_questions` field (`ARRAY` of `STRING`).
- Returns parsed JSON.

### 2d — `runAdversarialReview(extracted, geminiApiKey)`

Two sequential Gemini calls:

1. Red-team call → returns `string[]` of concerns.
2. Blue-team call (receives red-team output) → returns `{ confirmed_issues: string[], cleared_issues: string[] }`.

### 2e — `onInvestigationTrigger` (exported Cloud Function)

```ts
export const onInvestigationTrigger = onDocumentUpdated({
  document: "airline-upload/{docId}",
  region: "asia-east1",
  secrets: [geminiApiKeySecret],
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  // Only fire when ai_extracted flips true and investigation hasn't run yet
  if (!after?.ai_extracted || before?.ai_extracted || after?.investigation) return;

  // ... loop logic
});
```

**Loop body:**

1. Read `extractedData` from `after`.
2. Compute round-0 score with `openQuestions = []`.
3. Write `investigation.started` audit event.
4. Loop up to 3 additional rounds:
   - If `score >= 70 && openQuestions.length === 0` → `status: COMPLETE`, break.
   - If `score < 70 || openQuestions.length > 0` → call `callGeminiInvestigation`, recompute score.
   - Degradation check: if `(prevScore - score) / prevScore > 0.10` → `status: degrading`, break.
   - Write `investigation.round` audit event.
5. If `status: COMPLETE` → call `runAdversarialReview`.
6. If final score ≥ 95 → mark draft_actions as `executed` (Jira calls stubbed for now).
7. Write `investigation` map to Firestore.
8. Write `investigation.complete` / `investigation.degrading` audit event.
9. Update `ocr.completed` audit metadata with `investigation.score`.

---

## Step 3 — Register the new function in `index.ts`

Add to `functions/src/index.ts`:

```ts
export { onInvestigationTrigger } from "./investigation";
```

Add `onDocumentUpdated` to the existing import from `firebase-functions/v2/firestore`.

---

## Step 4 — Deploy & verify

```bash
cd functions && npm run build
firebase deploy --only functions:onInvestigationTrigger
```

Manual verification:
- Upload a document → confirm OCR completes without `confidenceScore` in Firestore.
- Confirm `investigation.*` map appears on the document after OCR.
- Check `audit-log` for `investigation.started`, `investigation.round`, `investigation.complete` events.
- Upload a thin/poor document → confirm loop runs multiple rounds and exits correctly.

---

## File Changeset

| File | Change |
|------|--------|
| `functions/src/index.ts` | Remove `confidenceScore` from schema, prompt, audit metadata; add `onDocumentUpdated` import; export `onInvestigationTrigger` |
| `functions/src/investigation.ts` | New — score formula, loop, adversarial review, Cloud Function |
