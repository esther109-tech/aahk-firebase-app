import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

function getISOWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getWeekStart(date: Date): Date {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return d;
}

export const onFleetInventoryWrite = onDocumentWritten(
    { document: "fleet-inventory/{tailNumber}", region: "asia-east1" },
    async (event) => {
        const after = event.data?.after;
        const airlineName: string | undefined = (after?.data() ?? event.data?.before?.data())?.airlineName;

        if (!airlineName) {
            logger.warn("onFleetInventoryWrite: no airlineName found, skipping snapshot");
            return;
        }

        try {
            const db = admin.firestore();

            const fleetSnap = await db.collection("fleet-inventory")
                .where("airlineName", "==", airlineName)
                .get();

            const total = fleetSnap.size;
            let compliant = 0;

            fleetSnap.docs.forEach((d) => {
                if (d.data().lastComplianceStatus === "Passed") compliant++;
            });

            const pendingSnap = await db.collection("airline-upload")
                .where("airlineName", "==", airlineName)
                .where("status", "in", ["Pending Review", "Under Review"])
                .get();

            const now = new Date();
            const week = getISOWeek(now);
            const weekStart = getWeekStart(now);
            const docId = `${airlineName}_${week}`;

            await db.collection("compliance-snapshots").doc(docId).set({
                airlineName,
                week,
                weekStart: admin.firestore.Timestamp.fromDate(weekStart),
                totalAircraft: total,
                compliantAircraft: compliant,
                complianceRate: total > 0 ? Math.round((compliant / total) * 100 * 10) / 10 : 0,
                pendingReviews: pendingSnap.size,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            logger.info(`Snapshot upserted: ${docId} — ${compliant}/${total} compliant`);
        } catch (err) {
            logger.error("onFleetInventoryWrite: failed to upsert snapshot", err);
        }
    }
);
