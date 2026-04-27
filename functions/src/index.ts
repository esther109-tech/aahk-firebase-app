import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

/**
 * v5.3 - Integrated Notification Workflow (SDK Standard Fix)
 * This function triggers on any WRITE to a document in the airline-upload collection.
 * Instead of sending emails directly, it creates a document in the 'mail' collection,
 * which is then processed by the Firebase Trigger Email Extension.
 */

// v5.3 REVERT: Initialize without databaseId (unsupported in AppOptions)
admin.initializeApp();

// Module-level diagnostic
logger.info("SYSTEM: Airline Notification Function Module [v5.3] Initialized");

export const onAirlineUpdateCreated = onDocumentWritten({
    database: "(default)",
    document: "airline-upload/{docId}",
    region: "asia-east1",
}, async (event) => {
    logger.info("TRIGGER: New document write detected", { docId: event.params.docId });

    const data = event.data?.after.data() || {};
    logger.info("DATA: Document data", { data });

    const fileName = data.file_name;
    const userEmail = data.userEmail;
    const recipientEmail = data.recipientEmail || "esther.shih@microfusion.cloud";

    logger.info("ACTION: Queueing email via Trigger Email extension", {
        to: recipientEmail,
        fileName
    });

    try {
        // v5.3 FIX: Explicitly target the named database in every call
        const db = getFirestore();

        await db.collection("mail").add({
            to: recipientEmail,
            message: {
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
    
            <p style="color: #64748b; font-size: 14px;">Log ID: ${event.params.docId}</p>
          </div>
        `,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.info("SUCCESS: Email document successfully added to queue.");

    } catch (error: any) {
        logger.error("QUEUE FAILURE: Could not add document to mail collection", {
            message: error.message
        });
    }
});
