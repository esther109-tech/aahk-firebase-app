import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import * as logger from "firebase-functions/logger";

/**
 * v3.1 - Force trigger synchronization
 * This function triggers on any WRITE to a document in the airline-upload collection
 * within the named database "aahk-firestore".
 */

admin.initializeApp();

// Module-level diagnostic: Runs every time a function instance is loaded
logger.info("SYSTEM: Airline Notification Function Module Initialized [v3.1]");

// SMTP Configuration Constants
const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465; // SSL

export const onAirlineUpdateCreated = onDocumentWritten({
    database: "aahk-firestore",
    document: "airline-upload/{docId}",
    secrets: ["GMAIL_USER", "GMAIL_PASS"],
}, async (event) => {
    logger.info("TRIGGER: New document write detected on aahk-firestore", {
        docId: event.params.docId
    });

    const change = event.data;
    if (!change) {
        logger.warn("WARN: Data change object is missing");
        return;
    }

    const data = change.after.data();

    // Safety check for deletions
    if (!data) {
        logger.info("INFO: Document deleted. Terminating trigger.");
        return;
    }

    const fileName = data.fie_name;
    const userEmail = data.userEmail;
    const recipientEmail = data.recipientEmail || "esther.shih@microfusion.cloud";

    logger.info("EXECUTION: Extracting metadata and configuring transport", {
        fileName,
        submitter: userEmail,
        targetRecipient: recipientEmail
    });

    // Secret existence check
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;

    if (!gmailUser || !gmailPass) {
        logger.error("FATAL ERROR: GMAIL_USER or GMAIL_PASS is not found in secrets/env");
        return;
    }

    logger.info("AUTH: Secrets retrieved successfully (length-checked)", {
        userLength: gmailUser.length,
        passLength: gmailPass.length
    });

    // Explicit SMTP Transport Creation
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true, // true for 465, false for other ports
        auth: {
            user: gmailUser,
            pass: gmailPass,
        },
    });

    try {
        // Verification Step: Validates credentials and connection
        logger.info("SMTP: Verifying connection with mail server...");
        await transporter.verify();
        logger.info("SMTP: Connection verified. Proceeding to send.");

        const mailOptions = {
            from: `"SkyGate Portal" <${gmailUser}>`,
            to: recipientEmail,
            subject: `✈️ Airline Information Update: ${data.status || 'Notification'}`,
            html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #0f172a;">Aviation Portal Update</h2>
            <p style="color: #475569;">The following update has been logged in the system:</p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f1f5f9;">
              <p><strong>Database:</strong> aahk-firestore</p>
              <p><strong>Filename:</strong> ${fileName}</p>
              <p><strong>Submitted by:</strong> ${userEmail}</p>
              <p><strong>Final Status:</strong> <span style="color: #64748b;">${data.status || 'Pending Review'}</span></p>
            </div>
    
            <p style="color: #64748b; font-size: 14px;">Log ID: ${event.params.docId}</p>
          </div>
        `,
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info("SUCCESS: Email delivered to SMTP server", {
            messageId: info.messageId
        });

    } catch (error: any) {
        logger.error("SMTP FAILURE: Detailed error captured", {
            message: error.message,
            code: error.code,
            response: error.response,
            command: error.command
        });

        if (error.code === 'EAUTH') {
            logger.error("ADVICE: Gmail Authentication failed. Check for spaces in GMAIL_PASS secret or ensure 2FA App Password is generated correctly.");
        }
    }
});
