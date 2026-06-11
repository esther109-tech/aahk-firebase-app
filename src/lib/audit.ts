import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface AuditEvent {
  submissionId: string;
  airlineName: string;
  action:
    | "submission.created"
    | "submission.status_changed"
    | "submission.comment_added"
    | "ocr.completed"
    | "ocr.failed";
  actor: { uid: string; email: string; displayName: string };
  metadata: Record<string, unknown>;
}

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await addDoc(collection(db, "audit-log"), {
      ...event,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error("[audit] Failed to write event:", err);
  }
}
