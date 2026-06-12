"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { exportAuditCSV, exportAuditPDF, AuditEventRecord, SubmissionSummary } from "@/lib/exportAudit";
import { RefreshCw, Download, FileDown, Clock, CheckCircle2, AlertTriangle, MessageSquare, Sparkles, FileText } from "lucide-react";

interface AuditTrailProps {
  submissionId: string;
  submission: SubmissionSummary;
}

const ACTION_LABELS: Record<string, string> = {
  "submission.created": "Submission created",
  "submission.status_changed": "Status changed",
  "submission.comment_added": "Comment added",
  "ocr.completed": "OCR extraction completed",
  "ocr.failed": "OCR extraction failed",
};

function getDotClass(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case "submission.status_changed":
      return metadata.to === "Approved"
        ? "bg-emerald-500 shadow-emerald-200"
        : metadata.to === "Action Required"
        ? "bg-rose-500 shadow-rose-200"
        : "bg-amber-400 shadow-amber-200";
    case "submission.comment_added":
      return "bg-blue-400 shadow-blue-200";
    case "ocr.completed":
      return "bg-violet-500 shadow-violet-200";
    case "ocr.failed":
      return "bg-rose-500 shadow-rose-200";
    default:
      return "bg-slate-400 shadow-slate-200";
  }
}

function ActionIcon({ action }: { action: string }) {
  const cls = "w-3.5 h-3.5";
  switch (action) {
    case "submission.status_changed": return <CheckCircle2 className={`${cls} text-emerald-500`} />;
    case "submission.comment_added": return <MessageSquare className={`${cls} text-blue-400`} />;
    case "ocr.completed": return <Sparkles className={`${cls} text-violet-500`} />;
    case "ocr.failed": return <AlertTriangle className={`${cls} text-rose-500`} />;
    default: return <FileText className={`${cls} text-slate-400`} />;
  }
}

function formatMetadataSummary(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case "submission.status_changed":
      return `${metadata.from} → ${metadata.to}`;
    case "submission.comment_added":
      return `"${metadata.commentPreview}"`;
    case "ocr.completed":
      return `Tail: ${metadata.tailNumber} · ${metadata.complianceStatus}`;
    case "investigation.complete":
      return `Score: ${metadata.finalScore}/100 · ${metadata.status} · ${metadata.totalRounds} round(s)`;
    case "investigation.degrading":
      return `Degraded ${metadata.previousScore}→${metadata.currentScore} at round ${metadata.round}`;
    case "investigation.adversarial":
      return `${(metadata.confirmed_issues as string[] | undefined)?.length ?? 0} confirmed · ${(metadata.cleared_issues as string[] | undefined)?.length ?? 0} cleared`;
    case "investigation.auto_executed":
      return `Auto-executed at score ${metadata.score}/100`;
    case "ocr.failed":
      return `Error: ${String(metadata.errorMessage).slice(0, 120)}`;
    case "submission.created":
      return `${metadata.fileName} (${metadata.fileType})`;
    default:
      return JSON.stringify(metadata);
  }
}

function formatTimestamp(ts: { seconds: number } | null): string {
  if (!ts) return "Just now";
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditTrail({ submissionId, submission }: AuditTrailProps) {
  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, "audit-log"),
        where("submissionId", "==", submissionId),
        orderBy("timestamp", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);
      setEvents(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuditEventRecord, "id">),
        }))
      );
    } catch (err) {
      console.error("[AuditTrail] fetch error:", err);
      setError("Audit log unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleExportCSV = () => {
    exportAuditCSV(submission, events);
  };

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      await exportAuditPDF(submission, events);
    } finally {
      setExporting(null);
    }
  };

  const hasEvents = events.length > 0;

  return (
    <div className="space-y-4">
      {/* Export buttons */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {isLoading ? "Loading..." : `${events.length} event${events.length !== 1 ? "s" : ""}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!hasEvents || isLoading}
            title={!hasEvents ? "No audit events recorded yet" : "Export CSV"}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={!hasEvents || isLoading || exporting === "pdf"}
            title={!hasEvents ? "No audit events recorded yet" : "Export PDF"}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exporting === "pdf" ? "Generating..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-rose-700">{error}</span>
          <button
            onClick={fetchEvents}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-200 mt-1.5 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-2.5 bg-slate-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && events.length === 0 && (
        <div className="py-10 text-center">
          <Clock className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-400">No events recorded yet.</p>
          <p className="text-xs text-slate-300 mt-1">Events will appear here as actions are taken.</p>
        </div>
      )}

      {/* Timeline */}
      {!isLoading && !error && events.length > 0 && (
        <div className="relative pl-5">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-100" />

          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="relative">
                {/* Dot */}
                <div
                  className={`absolute -left-5 top-[5px] w-2.5 h-2.5 rounded-full shadow-sm ${getDotClass(
                    event.action,
                    event.metadata
                  )}`}
                />

                <div className="bg-slate-50/80 border border-slate-100 rounded-xl px-3 py-2.5 hover:border-slate-200 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ActionIcon action={event.action} />
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {ACTION_LABELS[event.action] || event.action}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium flex-shrink-0 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    <span className="font-semibold text-slate-600">{event.actor.email}</span>
                    {" · "}
                    {formatMetadataSummary(event.action, event.metadata)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
