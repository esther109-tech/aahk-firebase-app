import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { setSmtpCredentials } from "./helpers";
import config from "./config";
import { GoogleGenAI } from "@google/genai";
import * as mammoth from "mammoth";

const geminiApiKeySecret = defineSecret("GEMINI_API_KEY");

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

    try {
        // 1. Download file content from Storage (using direct fetch of the download URL)
        logger.info(`Downloading file from: ${fileContentUrl}`);
        const response = await fetch(fileContentUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        logger.info(`Successfully downloaded file. Size: ${buffer.length} bytes.`);

        // 2. Set up Gemini client
        const ai = new GoogleGenAI({ apiKey: geminiApiKeySecret.value() });

        const systemInstruction = `You are an expert aviation compliance auditor and OCR data parser working for the Airport Authority Hong Kong (AAHK).
Your task is to analyze the provided fleet update (which is either an uploaded aircraft document or an image of the aircraft/fleet asset).
Extract key metadata and perform a rigorous compliance audit. If details are missing, use analytical deduction or mark them as "Unknown".
Evaluate whether the details comply with aviation safety guidelines. Set complianceStatus to:
- "Passed" if all information is consistent and safe.
- "Action Required" if there are safety warnings, inconsistencies, missing critical dates, or signs of non-compliance.
- "Unknown" if there is insufficient information.`;

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
                confidenceScore: { type: "INTEGER" }
            },
            required: [
                "airlineName", 
                "aircraftModel", 
                "tailNumber", 
                "updateDate", 
                "summary", 
                "complianceStatus", 
                "complianceReason", 
                "confidenceScore"
            ]
        };

        let contents: any[] = [];

        // 3. Process according to file type
        if (fileType === "image" || fileName.toLowerCase().endsWith(".png") || fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg")) {
            logger.info("Processing as IMAGE multimodal OCR.");
            let mimeType = "image/jpeg";
            if (fileName.toLowerCase().endsWith(".png")) {
                mimeType = "image/png";
            } else if (fileName.toLowerCase().endsWith(".webp")) {
                mimeType = "image/webp";
            }

            contents = [
                {
                    inlineData: {
                        mimeType,
                        data: buffer.toString("base64")
                    }
                },
                "Extract structured details from this fleet asset image and audit it."
            ];
        } else {
            // Assume document (.docx)
            logger.info("Processing as DOCUMENT (.docx) text parsing.");
            const mammothResult = await mammoth.extractRawText({ buffer });
            const docText = mammothResult.value;
            logger.info(`Extracted raw text. Length: ${docText.length} characters.`);

            contents = [
                `Please audit this extracted fleet report document text:\n\n${docText}`
            ];
        }

        // 4. Run Gemini model
        logger.info("Calling Gemini 2.5 Flash...");
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
            throw new Error("Empty response returned from Gemini API");
        }

        const extractedData = JSON.parse(textResponse);

        // 5. Save structured data back to Firestore
        const db = admin.firestore();
        logger.info("Updating Firestore document with AI-extracted metadata...");
        await db.collection("airline-upload").doc(docId).update({
            extractedData: extractedData,
            ai_extracted: true,
            status: extractedData.complianceStatus === "Passed" ? "Approved" : "Action Required"
        });

        // Write ocr.completed audit event
        try {
            await db.collection("audit-log").add({
                submissionId: docId,
                airlineName: extractedData.airlineName || "Unknown",
                action: "ocr.completed",
                actor: { uid: "system", email: "ocr@skygate.aero", displayName: "Gemini OCR" },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    tailNumber: extractedData.tailNumber,
                    confidenceScore: extractedData.confidenceScore,
                    complianceStatus: extractedData.complianceStatus,
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
        logger.error(`FAILURE during OCR background processing for ${docId}`, err);
        const db = admin.firestore();
        await db.collection("airline-upload").doc(docId).update({
            ai_extracted: true,
            status: "Processing Error",
            error_log: err.message || "Unknown processing error"
        }).catch(writeErr => logger.error("Failed to write processing error to Firestore", writeErr));

        // Write ocr.failed audit event
        try {
            await db.collection("audit-log").add({
                submissionId: docId,
                airlineName: "Unknown",
                action: "ocr.failed",
                actor: { uid: "system", email: "ocr@skygate.aero", displayName: "Gemini OCR" },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                metadata: { errorMessage: String(err.message || "Unknown error").slice(0, 500) },
            });
        } catch (auditErr) {
            logger.error("Failed to write ocr.failed audit event", auditErr);
        }
    }
});

