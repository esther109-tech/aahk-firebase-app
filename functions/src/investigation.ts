import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI } from "@google/genai";

const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

const REQUIRED_FIELDS = ["airlineName", "aircraftModel", "tailNumber", "updateDate", "complianceReason"] as const;

type ComplianceStatus = "Passed" | "Action Required" | "Unknown";

interface DraftAction {
    type: "jira.comment" | "jira.transition" | "jira.assign";
    payload: Record<string, unknown>;
    status: "draft" | "executed";
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

// --- Score formula ---

function computeScore(extracted: Record<string, any>, openQuestions: string[]): number {
    const detectedFields: any[] = extracted.detectedFields ?? [];

    const fieldsScore = Math.round(Math.min(detectedFields.length, 30) / 30 * 34);

    const complianceMap: Record<ComplianceStatus, number> = {
        "Passed": 33,
        "Action Required": 17,
        "Unknown": 0,
    };
    const complianceScore = complianceMap[extracted.complianceStatus as ComplianceStatus] ?? 0;

    const nonUnknownCount = REQUIRED_FIELDS.filter(
        f => extracted[f] && extracted[f] !== "Unknown"
    ).length;
    const completenessScore = Math.round((nonUnknownCount / 5) * 33);

    const penalty = Math.min(openQuestions.length * 5, 20);

    return Math.max(0, fieldsScore + complianceScore + completenessScore - penalty);
}

// --- Investigation Gemini call ---

const investigationResponseSchema = {
    type: "OBJECT",
    properties: {
        airlineName: { type: "STRING" },
        aircraftModel: { type: "STRING" },
        tailNumber: { type: "STRING" },
        updateDate: { type: "STRING" },
        summary: { type: "STRING" },
        complianceStatus: {
            type: "STRING",
            enum: ["Passed", "Action Required", "Unknown"],
        },
        complianceReason: { type: "STRING" },
        detectedFields: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    value: { type: "STRING" },
                },
                required: ["name", "value"],
            },
        },
        open_questions: {
            type: "ARRAY",
            items: { type: "STRING" },
        },
    },
    required: [
        "airlineName", "aircraftModel", "tailNumber", "updateDate",
        "summary", "complianceStatus", "complianceReason",
        "detectedFields", "open_questions",
    ],
};

async function callGeminiInvestigation(
    ai: GoogleGenAI,
    extracted: Record<string, any>,
    openQuestions: string[],
    currentScore: number,
): Promise<{ updatedExtracted: Record<string, any>; openQuestions: string[] }> {
    const openQList = openQuestions.length > 0
        ? `\nOpen questions from last round:\n${openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
        : "";

    const guardNote = currentScore < 70
        ? `\nIMPORTANT: The current confidence score is ${currentScore}/100, which is below the required threshold of 70. You indicated completion but confidence is below the bar. Re-examine the document carefully and resolve as many open questions as possible.${openQList}`
        : `\nIMPORTANT: Open questions remain unresolved. Resolve them before marking complete.${openQList}`;

    const systemInstruction = `You are an expert document analyst and OCR data parser.
Re-examine the previously extracted document data and improve it.

1. In 'detectedFields', list EVERY identifiable piece of structured information found.
2. Populate aviation-specific fields (airlineName, aircraftModel, tailNumber, updateDate, complianceReason) from evidence in the document; set to "Unknown" only if genuinely absent.
3. Assess 'complianceStatus': "Passed", "Action Required", or "Unknown".
4. In 'open_questions', list any specific questions that remain unanswered after your best analysis. Return an empty array if none remain.${guardNote}`;

    const previousContext = `Previously extracted data:\n${JSON.stringify(extracted, null, 2)}\n\nRe-analyze and improve the extraction. Return updated fields and any remaining open_questions.`;

    const responseResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [previousContext],
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: investigationResponseSchema as any,
        },
    });

    if (!responseResult.text) throw new Error("Empty response from Gemini investigation round");

    const parsed = JSON.parse(responseResult.text);
    const { open_questions: oq, ...rest } = parsed;
    return { updatedExtracted: rest, openQuestions: oq ?? [] };
}

// --- Adversarial review ---

async function runAdversarialReview(
    ai: GoogleGenAI,
    extracted: Record<string, any>,
    openQuestions: string[],
): Promise<{ redTeam: string[]; confirmed_issues: string[]; cleared_issues: string[] }> {
    const context = `Extracted document data:\n${JSON.stringify(extracted, null, 2)}${
        openQuestions.length > 0 ? `\n\nRemaining open questions:\n${openQuestions.join("\n")}` : ""
    }`;

    // Red-team
    const redResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [context],
        config: {
            systemInstruction: `You are a skeptical compliance auditor. Review this extraction and find every weakness, inconsistency, missing piece, or assumption. Be adversarial. Return a JSON array of concern strings.`,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: { concerns: { type: "ARRAY", items: { type: "STRING" } } },
                required: ["concerns"],
            } as any,
        },
    });
    if (!redResult.text) throw new Error("Empty red-team response");
    const redTeam: string[] = JSON.parse(redResult.text).concerns ?? [];

    // Blue-team
    const blueContext = `${context}\n\nRed-team concerns:\n${redTeam.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
    const blueResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [blueContext],
        config: {
            systemInstruction: `You are a compliance defender. Given these red-team concerns, determine which are genuine issues vs. false alarms. Return confirmed_issues and cleared_issues as string arrays.`,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    confirmed_issues: { type: "ARRAY", items: { type: "STRING" } },
                    cleared_issues: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["confirmed_issues", "cleared_issues"],
            } as any,
        },
    });
    if (!blueResult.text) throw new Error("Empty blue-team response");
    const { confirmed_issues, cleared_issues } = JSON.parse(blueResult.text);

    return { redTeam, confirmed_issues: confirmed_issues ?? [], cleared_issues: cleared_issues ?? [] };
}

// --- Cloud Function ---

export const onInvestigationTrigger = onDocumentUpdated({
    document: "airline-upload/{docId}",
    region: "asia-east1",
    secrets: [geminiApiKeySecret],
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const docId = event.params.docId;

    // Only fire when ai_extracted flips to true and investigation hasn't run yet
    if (!after?.ai_extracted || before?.ai_extracted || after?.investigation) return;

    logger.info(`INVESTIGATION: Starting for ${docId}`);

    const db = admin.firestore();
    const ai = new GoogleGenAI({ apiKey: geminiApiKeySecret.value() });

    const writeAudit = async (action: string, metadata: Record<string, unknown>) => {
        try {
            await db.collection("audit-log").add({
                submissionId: docId,
                airlineName: after.extractedData?.airlineName || "Unknown",
                action,
                actor: { uid: "system", email: "investigation@skygate.aero", displayName: "Investigation Agent" },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                metadata,
            });
        } catch (err) {
            logger.error(`Failed to write ${action} audit event`, err);
        }
    };

    let extracted: Record<string, any> = { ...(after.extractedData ?? {}) };
    let openQuestions: string[] = [];
    const scoresPerRound: number[] = [];

    // Round 0 — evaluate OCR output as-is
    let score = computeScore(extracted, openQuestions);
    scoresPerRound.push(score);
    logger.info(`INVESTIGATION round 0: score=${score}`);
    await writeAudit("investigation.started", { round: 0, score });

    let finalStatus: InvestigationState["status"] = "investigating";

    for (let round = 1; round <= 3; round++) {
        if (score >= 70 && openQuestions.length === 0) {
            finalStatus = "complete";
            break;
        }

        try {
            const { updatedExtracted, openQuestions: newOQ } = await callGeminiInvestigation(
                ai, extracted, openQuestions, score
            );
            extracted = updatedExtracted;
            openQuestions = newOQ;
        } catch (err) {
            logger.error(`INVESTIGATION round ${round} Gemini call failed`, err);
            break;
        }

        const previousScore = score;
        score = computeScore(extracted, openQuestions);
        scoresPerRound.push(score);
        logger.info(`INVESTIGATION round ${round}: score=${score}, open_questions=${openQuestions.length}`);
        await writeAudit("investigation.round", { round, score, open_questions: openQuestions });

        // Degradation check
        if (previousScore > 0 && (previousScore - score) / previousScore > 0.10) {
            logger.warn(`INVESTIGATION: Score degraded from ${previousScore} to ${score} — exiting.`);
            finalStatus = "degrading";
            await writeAudit("investigation.degrading", { round, previousScore, currentScore: score });
            break;
        }

        if (score >= 70 && openQuestions.length === 0) {
            finalStatus = "complete";
            break;
        }

        if (round === 3) {
            finalStatus = "max_rounds";
        }
    }

    // If loop exited without running (score already ≥70 at round 0 with no open questions)
    if (finalStatus === "investigating") {
        finalStatus = "complete";
    }

    const state: Omit<InvestigationState, "completedAt"> & { completedAt: admin.firestore.FieldValue } = {
        score,
        round: scoresPerRound.length - 1,
        status: finalStatus,
        open_questions: openQuestions,
        scores_per_round: scoresPerRound,
        draft_actions: [],
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Adversarial review
    if (finalStatus === "complete") {
        try {
            logger.info(`INVESTIGATION: Running adversarial review for ${docId}`);
            const adversarial = await runAdversarialReview(ai, extracted, openQuestions);
            state.adversarial = adversarial;
            await writeAudit("investigation.adversarial", {
                confirmed_issues: adversarial.confirmed_issues,
                cleared_issues: adversarial.cleared_issues,
            });
        } catch (err) {
            logger.error("INVESTIGATION: Adversarial review failed", err);
        }
    }

    // Auto-execute gate
    if (score >= 95) {
        // Jira integration stubbed — mark actions as executed placeholders
        state.draft_actions = [
            { type: "jira.comment", payload: { body: `Investigation complete. Score: ${score}/100. Compliance: ${extracted.complianceStatus}.` }, status: "executed" },
            { type: "jira.transition", payload: { status: extracted.complianceStatus === "Passed" ? "Done" : "In Review" }, status: "executed" },
            { type: "jira.assign", payload: { tailNumber: extracted.tailNumber }, status: "executed" },
        ];
        await writeAudit("investigation.auto_executed", { actions: state.draft_actions.map(a => a.type), score });
    } else {
        state.draft_actions = [
            { type: "jira.comment", payload: { body: `Investigation complete. Score: ${score}/100. Compliance: ${extracted.complianceStatus}.` }, status: "draft" },
            { type: "jira.transition", payload: { status: extracted.complianceStatus === "Passed" ? "Done" : "In Review" }, status: "draft" },
            { type: "jira.assign", payload: { tailNumber: extracted.tailNumber }, status: "draft" },
        ];
    }

    // Persist investigation state
    await db.collection("airline-upload").doc(docId).update({ investigation: state });

    // Update ocr.completed audit event with deterministic score
    await writeAudit("investigation.complete", {
        status: finalStatus,
        finalScore: score,
        totalRounds: scoresPerRound.length - 1,
    });

    logger.info(`INVESTIGATION: Complete for ${docId} — status=${finalStatus}, score=${score}`);
});
