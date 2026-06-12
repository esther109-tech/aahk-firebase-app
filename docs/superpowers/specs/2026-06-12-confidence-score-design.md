# Deterministic Confidence Score & Investigation Agent — Design Spec

**Date:** 2026-06-12
**Project:** SkyGate Portal
**Scope:** New `onInvestigationTrigger` Cloud Function; remove LLM-assigned `confidenceScore` from OCR pipeline

---

## Problem

`extractedData.confidenceScore` is a free-form integer assigned by Gemini 2.5 Flash with no enforcement, no repeatability, and no gating logic. It cannot be used as a reliable control signal.

---

## Goals

- Replace the LLM-assigned score with a deterministic, arithmetic value derived from measurable OCR signals.
- Add an investigation loop that gates progress based on the score.
- Add an adversarial review phase (red-team / blue-team) for extractions that clear the loop.
- Auto-execute non-destructive actions at score ≥ 95; produce draft suggestions below.
- Detect score degradation across rounds and exit early.

---

## Non-Goals

- Changes to the OCR pipeline beyond removing `confidenceScore` from the schema and system prompt.
- UI changes (draft actions are written to Firestore; rendering is a separate task).
- Destructive Jira actions (ticket deletion, field overwrite without approval).
- New Firestore collections — all state lives on the existing `airline-upload` document.

---

## Architecture

A new Cloud Function `onInvestigationTrigger` fires on Firestore `onUpdate` of `airline-upload` when `ai_extracted` transitions to `true`. It is fully decoupled from the OCR function.

```
OCR Function                     Investigation Agent
────────────────────────         ──────────────────────────────────────────
onFileUpload                     onInvestigationTrigger
  → Document AI + Gemini           → compute deterministic score (round 0)
  → write ai_extracted: true       → investigation loop (≤ 3 additional rounds)
                                   → adversarial review (if gates pass)
                                   → write investigation.* to Firestore
```

All agent state is written to a top-level `investigation` map on the same `airline-upload` document.

### OCR Pipeline Change

Remove from `functions/src/index.ts`:
- `confidenceScore` from the `responseSchema`
- `confidenceScore` from the `required` array
- Line 274: the `confidenceScore` instruction from `systemInstruction`
- Line 397: `confidenceScore: extractedData.confidenceScore` from the `ocr.completed` audit event metadata

The `ocr.completed` audit event will be updated by the investigation agent once the score is computed.

---

## Score Formula

Three dimensions, roughly equal weight, applied once per round:

```ts
const fieldsScore = Math.round(Math.min(detectedFields.length, 30) / 30 * 34); // 0–34

const complianceScore = {
  "Passed": 33,
  "Action Required": 17,
  "Unknown": 0,
}[complianceStatus] ?? 0; // 0–33

const REQUIRED_FIELDS = ["airlineName", "aircraftModel", "tailNumber", "updateDate", "complianceReason"];
const nonUnknownCount = REQUIRED_FIELDS.filter(
  f => extracted[f] && extracted[f] !== "Unknown"
).length;
const completenessScore = Math.round((nonUnknownCount / 5) * 33); // 0–33

const penalty = Math.min(openQuestions.length * 5, 20); // 0–20 (LLM-bounded)

const score = Math.max(0, fieldsScore + complianceScore + completenessScore - penalty);
```

### Dimension Reference

| Dimension | Max pts | Full marks condition |
|-----------|---------|----------------------|
| Detected fields | 34 | ≥ 30 fields extracted |
| Compliance status | 33 | `complianceStatus = "Passed"` |
| Completeness | 33 | All 5 required fields non-Unknown |
| open_questions penalty | −20 | Each question −5, capped at −20 |

The LLM penalty is bounded to ±20 so it cannot single-handedly swing the score across a gate threshold.

---

## Gate Thresholds

| Condition | Outcome |
|-----------|---------|
| `score < 70` | Cannot exit loop — up to 3 additional rounds forced |
| `score ≥ 70 AND status: COMPLETE AND open_questions empty` | Gate opens to adversarial review |
| `score ≥ 95` (post-adversarial) | Auto-execute non-destructive actions |
| Score drops `> 10%` across two consecutive rounds | Exit loop with `reason: "degrading"` |

---

## Investigation Loop

Round 0 uses the existing OCR extraction. Rounds 1–3 are Gemini re-investigation calls.

```
round 0: compute score from OCR output
  │
  ├─ score ≥ 70 AND openQuestions.length === 0 → COMPLETE → adversarial review
  ├─ score ≥ 70 AND openQuestions non-empty    → continue loop (not COMPLETE)
  └─ score < 70                                → continue loop
        │
        for round in [1, 2, 3]:
          │
          │  Guard prompt injected:
          │  "Confidence score is {n}/100. Open questions: {list}.
          │   You indicated completion but the score is below the required threshold.
          │   Re-examine the document and resolve as many open questions as possible."
          │
          │  Gemini call → updated extracted fields + new open_questions[]
          │  recompute score
          │
          ├─ (currentScore - previousScore) / previousScore < -0.10 → exit "degrading"
          ├─ score ≥ 70 AND openQuestions empty → COMPLETE → adversarial review
          └─ rounds exhausted → exit "max_rounds", store best score achieved
```

### Degradation Check

```ts
const drop = previousScore - currentScore;
if (previousScore > 0 && drop / previousScore > 0.10) {
  // exit with reason: "degrading"
}
```

Applied before the gate check each round so a degrading extraction never opens the adversarial phase.

---

## Adversarial Review Phase

Triggered only when `status: COMPLETE`. Two sequential Gemini calls:

**Red-team prompt:**
> "You are a skeptical compliance auditor. Review this extraction and find every weakness, inconsistency, missing piece, or assumption. Be adversarial. Return a JSON array of concern strings."

**Blue-team prompt (receives red-team output):**
> "You are a compliance defender. Given these red-team concerns, determine which are genuine issues vs. false alarms. Return `confirmed_issues` and `cleared_issues` as string arrays."

Output stored under `investigation.adversarial`:
```ts
{
  redTeam: string[];        // raw concerns
  confirmed_issues: string[];
  cleared_issues: string[];
}
```

No score adjustment from adversarial output — purely informational for the operator.

---

## Auto-Execute Gate (score ≥ 95)

After the adversarial pass:

| Score | Outcome |
|-------|---------|
| ≥ 95 | Auto-execute: Jira comment, status transition, ticket assignment |
| < 95 | Write to `investigation.draft_actions[]` for operator approval |

Draft action shape:
```ts
{
  type: "jira.comment" | "jira.transition" | "jira.assign";
  payload: Record<string, unknown>;
  status: "draft" | "executed";
}
```

---

## Firestore Schema — `investigation` Map

Written to `airline-upload/{docId}.investigation`:

```ts
{
  score: number;                  // final deterministic score
  round: number;                  // round that produced the final score
  status: "investigating" | "complete" | "degrading" | "max_rounds";
  open_questions: string[];       // from final Gemini round
  scores_per_round: number[];     // [round0Score, round1Score, ...]
  adversarial?: {
    redTeam: string[];
    confirmed_issues: string[];
    cleared_issues: string[];
  };
  draft_actions: DraftAction[];   // empty if auto-executed
  completedAt: Timestamp;
}
```

---

## Audit Events

| Event | When | New fields |
|-------|------|-----------|
| `ocr.completed` (updated) | Agent writes final score | Replaces removed `confidenceScore` with `investigation.score` |
| `investigation.started` | Agent fires | `round: 0, score: number` |
| `investigation.round` | Each loop round | `round: n, score: number, open_questions: string[]` |
| `investigation.complete` | Loop exits | `status, finalScore, totalRounds` |
| `investigation.degrading` | Degradation exit | `previousScore, currentScore, round` |
| `investigation.adversarial` | After red/blue team | `confirmed_issues, cleared_issues` |
| `investigation.auto_executed` | score ≥ 95 | `actions: string[]` |

---

## Files Changed

| File | Change |
|------|--------|
| `functions/src/index.ts` | Remove `confidenceScore` from OCR schema, system prompt, and audit metadata |
| `functions/src/investigation.ts` | New — `onInvestigationTrigger` function, score formula, loop, adversarial phase |
