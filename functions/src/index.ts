import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { setSmtpCredentials } from "./helpers";
import config from "./config";

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
