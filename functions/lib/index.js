"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAirlineUpdateCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const nodemailer = __importStar(require("nodemailer"));
admin.initializeApp();
exports.onAirlineUpdateCreated = (0, firestore_1.onDocumentCreated)({
    database: "aahk-firestore",
    document: "airline-upload/{docId}",
    secrets: ["GMAIL_USER", "GMAIL_PASS"],
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No data associated with the event");
        return;
    }
    const data = snapshot.data();
    const fileName = data.fie_name;
    const userEmail = data.userEmail;
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;
    if (!gmailUser || !gmailPass) {
        console.error("GMAIL_USER or GMAIL_PASS secret is not set");
        return;
    }
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: gmailUser,
            pass: gmailPass,
        },
    });
    const mailOptions = {
        from: `"SkyGate Portal" <${gmailUser}>`,
        to: "esther.shih@microfusion.cloud",
        subject: "✈️ New Airline Information Update Submitted",
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #0f172a;">New Airline Update Form</h2>
        <p style="color: #475569;">A new airline information update has been submitted for review.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f1f5f9;">
          <p><strong>Filename:</strong> ${fileName}</p>
          <p><strong>Submitted by:</strong> ${userEmail}</p>
          <p><strong>Status:</strong> <span style="color: #64748b;">Pending Review</span></p>
        </div>

        <p style="color: #64748b; font-size: 14px;">This is an automated notification from the SkyGate Portal system.</p>
      </div>
    `,
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Notification email sent for ${fileName} to AAHK (esther.shih@microfusion.cloud)`);
    }
    catch (error) {
        console.error("Error sending notification email:", error);
    }
});
//# sourceMappingURL=index.js.map