import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
export { onFleetInventoryWrite } from "./snapshotTrigger";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { setSmtpCredentials } from "./helpers";
import config from "./config";
import { GoogleGenAI } from "@google/genai";
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

// Document AI processor (us region, project gcp-tw-sandbox)
const DOCUMENT_AI_PROCESSOR =
    "projects/593899410363/locations/us/processors/6e517f811613ce";

const docAIClient = new DocumentProcessorServiceClient({
    apiEndpoint: "us-documentai.googleapis.com",
});

interface DocAIResult {
    fullText: string;
    formFields: Array<{ name: string; value: string }>;
    tables: Array<{ headers: string[]; rows: string[][] }>;
}

function extractTextFromAnchor(
    fullText: string,
    anchor: { textSegments?: Array<{ startIndex?: number | string | null; endIndex?: number | string | null }> | null } | null | undefined
): string {
    if (!anchor?.textSegments?.length) return "";
    return anchor.textSegments
        .map((seg) => fullText.slice(Number(seg.startIndex ?? 0), Number(seg.endIndex ?? 0)))
        .join("");
}

async function callDocumentAI(buffer: Buffer, mimeType: string): Promise<DocAIResult> {
    const [result] = await docAIClient.processDocument({
        name: DOCUMENT_AI_PROCESSOR,
        rawDocument: {
            content: buffer.toString("base64"),
            mimeType,
        },
    });

    const document = result.document;
    const fullText: string = (document as any)?.text ?? "";
    const formFields: Array<{ name: string; value: string }> = [];
    const tables: Array<{ headers: string[]; rows: string[][] }> = [];

    for (const page of (document as any)?.pages ?? []) {
        for (const field of page.formFields ?? []) {
            const name = extractTextFromAnchor(fullText, field.fieldName?.textAnchor).trim();
            const value = extractTextFromAnchor(fullText, field.fieldValue?.textAnchor).trim();
            if (name) formFields.push({ name, value });
        }

        for (const table of page.tables ?? []) {
            const headers = (table.headerRows?.[0]?.cells ?? []).map((cell: any) =>
                extractTextFromAnchor(fullText, cell.layout?.textAnchor).trim()
            );
            const rows = (table.bodyRows ?? []).map((row: any) =>
                (row.cells ?? []).map((cell: any) =>
                    extractTextFromAnchor(fullText, cell.layout?.textAnchor).trim()
                )
            );
            if (headers.length || rows.length) tables.push({ headers, rows });
        }
    }

    return { fullText, formFields, tables };
}

const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryableError(err: unknown): boolean {
    const status = (err as any)?.status as number | undefined;
    const message = String((err as any)?.message ?? "");
    const causeCode = (err as any)?.cause?.code as string | undefined;

    // Explicit retryable marker (e.g. empty Gemini response)
    if ((err as any)?.retryable === true) return true;

    // HTTP 429 (rate limit) and 5xx server errors
    if (status === 429 || (status !== undefined && status >= 500 && status <= 504)) return true;

    // Node.js network error codes
    if (causeCode === "ECONNRESET" || causeCode === "ETIMEDOUT" || causeCode === "ENOTFOUND") return true;

    // fetch() network failure
    if (message.includes("fetch failed") || message.toLowerCase().includes("network")) return true;

    return false;
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    baseDelayMs: number
): Promise<{ result: T; retryCount: number }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn();
            return { result, retryCount: attempt };
        } catch (err) {
            if (!isRetryableError(err)) throw err; // terminal — fail immediately
            lastErr = err;
            if (attempt < maxRetries) {
                await sleep(baseDelayMs * Math.pow(2, attempt));
            }
        }
    }
    (lastErr as any).retryCount = maxRetries;
    throw lastErr;
}

/**
 * v5.5 - Direct HTTPS Email Workflow (CORS enabled)
 * This function is triggered via an HTTPS POST request.
 * It sends emails directly via SMTP based on the request body.
 */

const smtpPasswordSecret = defineSecret("firestore-send-email-SMTP_PASSWORD");

admin.initializeApp();

export const onAirlineUpdateCreated = onRequest({
    region: "asia-east1",
    secrets: [smtpPasswordSecret],
    cors: true, // Enable CORS for portal integration
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    // 1. Verify Authorization Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).send("Unauthorized: Missing or invalid token");
        return;
    }

    const idToken = authHeader.split("Bearer ")[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        logger.info("AUTH: Token verified", { uid: decodedToken.uid });
    } catch (authErr) {
        logger.error("AUTH FAILURE: Invalid token", authErr);
        res.status(401).send("Unauthorized: Invalid token");
        return;
    }

    const data = req.body || {};
    const fileName = data.file_name;
    const userEmail = data.userEmail;
    const recipientEmail = data.recipientEmail || "esther.shih@microfusion.cloud";

    // Inject password from secret
    config.smtpPassword = smtpPasswordSecret.value();

    logger.info("ACTION: Sending email directly via SMTP", {
        to: recipientEmail,
        fileName
    });

    try {
        const transport = setSmtpCredentials(config);

        await transport.sendMail({
            from: config.defaultFrom,
            to: recipientEmail,
            subject: `✈️ Airline Information Update: ${data.status || 'Notification'}`,
            html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a;">Aviation Portal Update</h2>
            <p style="color: #475569;">A new update has been logged via the SkyGate Portal.</p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f1f5f9;">
              <p><strong>Filename:</strong> ${fileName}</p>
              <p><strong>Type:</strong> ${data.fileType || 'Document'}</p>
              <p><strong>Submitted by:</strong> ${userEmail}</p>
              <p><strong>Status:</strong> <span style="color: #64748b;">${data.status || 'Pending Review'}</span></p>
            </div>

            <div style="margin-top: 25px; text-align: center;">
              <a href="${data.file_content}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                View Uploaded Asset
              </a>
            </div>

            <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #f1f5f9; pt: 10px;">
              Direct Link: <a href="${data.file_content}" style="color: #3b82f6;">${data.file_content}</a>
            </p>
          </div>
        `,
        });

        logger.info("SUCCESS: Email sent successfully.");
        res.status(200).send({ status: "success", message: "Email sent" });

    } catch (error: any) {
        logger.error("SEND FAILURE", { message: error.message });
        res.status(500).send({ status: "error", message: error.message });
    }
});

/**
 * Background Firestore Trigger to process uploaded files (images or .docx files).
 * It downloads the file from Storage, parses .docx text using Mammoth (if applicable),
 * calls Gemini 2.5 Flash with multimodal support or raw text, and saves structured JSON data back to Firestore.
 */
export const onAirlineUploadOCRTrigger = onDocumentCreated({
    document: "airline-upload/{docId}",
    region: "asia-east1",
    secrets: [geminiApiKeySecret],
}, async (event) => {
    const docId = event.params.docId;
    logger.info(`TRIGGER: New document created in 'airline-upload' with ID: ${docId}`);

    const snap = event.data;
    if (!snap) {
        logger.error("No data snapshot found for this trigger event.");
        return;
    }

    const data = snap.data();
    const fileContentUrl = data.file_content;
    const fileName = data.file_name;
    const fileType = data.fileType; // "image" or "document"

    if (!fileContentUrl) {
        logger.warn(`No file content URL found in document ${docId}. Skipping processing.`);
        return;
    }

    let fetchRetries = 0;
    let geminiRetries = 0;

    try {
        // 1. Download file content from Storage (with retry on transient network errors)
        logger.info(`Downloading file from: ${fileContentUrl}`);
        const { result: buffer, retryCount: _fetchRetries } = await retryWithBackoff(
            async () => {
                const response = await fetch(fileContentUrl);
                if (!response.ok) {
                    throw Object.assign(
                        new Error(`Failed to fetch file: ${response.status} ${response.statusText}`),
                        { status: response.status }
                    );
                }
                return Buffer.from(await response.arrayBuffer());
            },
            3, 1000
        );
        fetchRetries = _fetchRetries;
        logger.info(`Successfully downloaded file. Size: ${buffer.length} bytes.${fetchRetries > 0 ? ` (after ${fetchRetries} retr${fetchRetries === 1 ? "y" : "ies"})` : ""}`);

        // 2. Set up Gemini client
        const ai = new GoogleGenAI({ apiKey: geminiApiKeySecret.value() });

        const systemInstruction = `You are an expert document analyst and OCR data parser.
Your task is to analyze the provided document content and extract all human-readable information, regardless of domain or industry.

1. In 'detectedFields', list EVERY identifiable piece of structured information found: field labels and values, dates, names, IDs, codes, reference numbers, amounts, statuses — be comprehensive, capture everything.
2. Populate the aviation-specific fields (airlineName, aircraftModel, tailNumber, updateDate) if they appear in the document; otherwise set them to "Unknown".
3. Write a concise 'summary' describing what the document contains and its purpose.
4. Assess 'complianceStatus':
   - "Passed" if the document appears complete, consistent, and free of anomalies.
   - "Action Required" if there are missing critical data, inconsistencies, safety concerns, or expired dates.
   - "Unknown" if there is insufficient information to assess.
5. Set 'confidenceScore' (0-100) reflecting the clarity and completeness of the extracted information.`;

        const responseSchema = {
            type: "OBJECT",
            properties: {
                airlineName: { type: "STRING" },
                aircraftModel: { type: "STRING" },
                tailNumber: { type: "STRING" },
                updateDate: { type: "STRING" },
                summary: { type: "STRING" },
                complianceStatus: {
                    type: "STRING",
                    enum: ["Passed", "Action Required", "Unknown"]
                },
                complianceReason: { type: "STRING" },
                confidenceScore: { type: "INTEGER" },
                detectedFields: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING" },
                            value: { type: "STRING" }
                        },
                        required: ["name", "value"]
                    }
                }
            },
            required: [
                "airlineName",
                "aircraftModel",
                "tailNumber",
                "updateDate",
                "summary",
                "complianceStatus",
                "complianceReason",
                "confidenceScore",
                "detectedFields"
            ]
        };

        let contents: any[] = [];
        let processingMethod = "gemini-multimodal";

        // 3. Resolve MIME type — supported: image/jpeg, image/png, image/webp, application/pdf
        const lowerName = fileName.toLowerCase();
        let mimeType = "image/jpeg";
        if (lowerName.endsWith(".png")) mimeType = "image/png";
        else if (lowerName.endsWith(".webp")) mimeType = "image/webp";
        else if (fileType === "pdf" || lowerName.endsWith(".pdf")) mimeType = "application/pdf";

        // 4. Try Document AI first; fall back to Gemini multimodal on failure
        try {
            logger.info(`Processing with Document AI OCR (mimeType: ${mimeType})...`);
            const docAI = await callDocumentAI(buffer, mimeType);
            logger.info(`Document AI: ${docAI.fullText.length} chars, ${docAI.formFields.length} form fields, ${docAI.tables.length} tables.`);

            let contextText = `Document Text:\n${docAI.fullText}`;
            if (docAI.formFields.length > 0) {
                contextText += `\n\nDetected Form Fields:\n${docAI.formFields.map((f) => `${f.name}: ${f.value}`).join("\n")}`;
            }
            if (docAI.tables.length > 0) {
                contextText += `\n\nDetected Tables:\n${docAI.tables.map((t, i) =>
                    `Table ${i + 1}:\nHeaders: ${t.headers.join(" | ")}\n${t.rows.map((r) => r.join(" | ")).join("\n")}`
                ).join("\n\n")}`;
            }

            contents = [`${contextText}\n\nAnalyze this document and extract all human-readable information.`];
            processingMethod = "documentai+gemini";
        } catch (docAIErr: any) {
            logger.warn(`Document AI failed (${docAIErr?.message}), falling back to Gemini multimodal.`);
            contents = [
                { inlineData: { mimeType, data: buffer.toString("base64") } },
                "Extract all human-readable structured information from this document."
            ];
            processingMethod = "gemini-multimodal";
        }

        // 4. Run Gemini model (with retry on rate limits, 5xx, empty responses)
        logger.info(`Calling Gemini 2.5 Flash for semantic analysis (processing method: ${processingMethod})...`);
        const { result: extractedData, retryCount: _geminiRetries } = await retryWithBackoff(
            async () => {
                const responseResult = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: contents,
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: responseSchema as any
                    }
                });
                const textResponse = responseResult.text;
                logger.info(`Raw response from Gemini: ${textResponse}`);
                if (!textResponse) {
                    throw Object.assign(new Error("Empty response from Gemini"), { retryable: true });
                }
                return JSON.parse(textResponse);
            },
            3, 1000
        );
        geminiRetries = _geminiRetries;
        if (geminiRetries > 0) logger.info(`Gemini call succeeded after ${geminiRetries} retr${geminiRetries === 1 ? "y" : "ies"}.`);

        // 5. Save structured data back to Firestore
        const db = admin.firestore();
        logger.info("Updating Firestore document with AI-extracted metadata...");
        await db.collection("airline-upload").doc(docId).update({
            extractedData: { ...extractedData, processingMethod },
            ai_extracted: true,
            status: extractedData.complianceStatus === "Passed" ? "Approved" : "Action Required"
        });

        // Write ocr.completed audit event
        try {
            const totalRetries = fetchRetries + geminiRetries;
            await db.collection("audit-log").add({
                submissionId: docId,
                airlineName: extractedData.airlineName || "Unknown",
                action: "ocr.completed",
                actor: { uid: "system", email: "ocr@skygate.aero", displayName: "Document AI + Gemini" },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    tailNumber: extractedData.tailNumber,
                    confidenceScore: extractedData.confidenceScore,
                    complianceStatus: extractedData.complianceStatus,
                    processingMethod,
                    detectedFieldCount: extractedData.detectedFields?.length ?? 0,
                    ...(totalRetries > 0 && { retryCount: totalRetries }),
                },
            });
        } catch (auditErr) {
            logger.error("Failed to write ocr.completed audit event", auditErr);
        }

        // 6. Upsert into fleet-inventory
        const tailNumber = extractedData.tailNumber ? extractedData.tailNumber.trim() : "";
        if (tailNumber && tailNumber.toLowerCase() !== "unknown" && tailNumber !== "") {
            logger.info(`Upserting aircraft into fleet-inventory: ${tailNumber}`);
            
            // Map complianceStatus to aircraft operational status
            let aircraftStatus = "Pending Review";
            if (extractedData.complianceStatus === "Passed") {
                aircraftStatus = "Active";
            } else if (extractedData.complianceStatus === "Action Required") {
                aircraftStatus = "In Maintenance";
            }

            await db.collection("fleet-inventory").doc(tailNumber).set({
                tailNumber: tailNumber,
                airlineName: extractedData.airlineName || "Unknown",
                aircraftModel: extractedData.aircraftModel || "Unknown",
                lastComplianceStatus: extractedData.complianceStatus || "Unknown",
                status: aircraftStatus,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                lastReportId: docId
            }, { merge: true });
            
            logger.info(`Successfully synchronized fleet-inventory for ${tailNumber}`);
        } else {
            logger.warn("Skipping fleet-inventory sync: tailNumber is missing or 'Unknown'.");
        }

        logger.info(`SUCCESS: Background OCR processing complete for ${docId}`);

    } catch (err: any) {
        const totalRetries = fetchRetries + geminiRetries;
        logger.error(`FAILURE during OCR background processing for ${docId} (retries: ${totalRetries})`, err);
        const db = admin.firestore();
        await db.collection("airline-upload").doc(docId).update({
            ai_extracted: true,
            status: "Processing Error",
            error_log: err.message || "Unknown processing error",
            retryCount: totalRetries,
        }).catch(writeErr => logger.error("Failed to write processing error to Firestore", writeErr));

        // Write ocr.failed audit event
        try {
            await db.collection("audit-log").add({
                submissionId: docId,
                airlineName: "Unknown",
                action: "ocr.failed",
                actor: { uid: "system", email: "ocr@skygate.aero", displayName: "Document AI + Gemini" },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    errorMessage: String(err.message || "Unknown error").slice(0, 500),
                    retryCount: totalRetries,
                },
            });
        } catch (auditErr) {
            logger.error("Failed to write ocr.failed audit event", auditErr);
        }
    }
});

