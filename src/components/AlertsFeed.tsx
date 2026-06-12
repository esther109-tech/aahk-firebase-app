"use client";

import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

interface Submission {
    id: string;
    airlineName?: string;
    status?: string;
    createdAt?: any;
    extractedData?: { tailNumber?: string; confidenceScore?: number };
    investigation?: { score?: number };
    ai_extracted?: boolean;
}

interface Snapshot {
    airlineName: string;
    complianceRate: number;
    week: string;
}

interface Alert {
    id: string;
    severity: "red" | "amber";
    label: string;
    description: string;
    timestamp: Date | null;
    submissionId?: string;
    airline?: string;
}

interface Props {
    submissions: Submission[];
    current: Snapshot[];
    previous: Snapshot[];
    truncate?: number;
}

function toDate(v: any): Date | null {
    if (!v) return null;
    if (v.seconds) return new Date(v.seconds * 1000);
    return null;
}

function relTime(d: Date | null): string {
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function AlertsFeed({ submissions, current, previous, truncate }: Props) {
    const { openDrawer } = useDashboard();

    const now = Date.now();
    const alerts: Alert[] = [];

    submissions.forEach((s) => {
        if (!["Pending Review", "Under Review"].includes(s.status ?? "")) return;
        const created = toDate(s.createdAt);
        const ageH = created ? (now - created.getTime()) / 3600000 : 0;
        if (ageH < 48) return;
        alerts.push({
            id: `overdue-${s.id}`,
            severity: ageH > 72 ? "red" : "amber",
            label: s.extractedData?.tailNumber ?? s.airlineName ?? "Unknown",
            description: `Overdue review — ${Math.floor(ageH)}h`,
            timestamp: created,
            submissionId: s.id,
        });
    });

    submissions.forEach((s) => {
        if (!s.ai_extracted) return;
        const score = s.investigation?.score ?? s.extractedData?.confidenceScore ?? 100;
        if (score >= 70) return;
        alerts.push({
            id: `ocr-${s.id}`,
            severity: "amber",
            label: s.extractedData?.tailNumber ?? "Unknown",
            description: `Low OCR confidence — ${score}%`,
            timestamp: toDate(s.createdAt),
            submissionId: s.id,
        });
    });

    current.forEach((snap) => {
        const prev = previous.find((p) => p.airlineName === snap.airlineName);
        if (!prev) return;
        const drop = prev.complianceRate - snap.complianceRate;
        if (drop < 5) return;
        alerts.push({
            id: `drop-${snap.airlineName}`,
            severity: "red",
            label: snap.airlineName,
            description: `Compliance drop ↓${drop.toFixed(1)}% WoW`,
            timestamp: null,
            airline: snap.airlineName,
        });
    });

    alerts.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "red" ? -1 : 1;
        const ta = a.timestamp?.getTime() ?? 0;
        const tb = b.timestamp?.getTime() ?? 0;
        return ta - tb;
    });

    const visible = truncate ? alerts.slice(0, truncate) : alerts;

    if (visible.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-2">
                    <AlertTriangle className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm text-slate-400">No active alerts</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {visible.map((alert) => (
                <button key={alert.id}
                    onClick={() => { if (alert.submissionId) { const s = submissions.find((s) => s.id === alert.submissionId); if (s) openDrawer(s); }}}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-left group">
                    <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${alert.severity === "red" ? "bg-rose-500" : "bg-amber-400"}`} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-extrabold px-1.5 py-0.5 rounded ${alert.severity === "red" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
                                {alert.severity === "red" ? "HIGH" : "MED"}
                            </span>
                            <span className="text-sm font-semibold text-slate-800 truncate">{alert.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{alert.description}</p>
                    </div>
                    {alert.timestamp && (
                        <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />{relTime(alert.timestamp)}
                        </span>
                    )}
                    {alert.airline && !alert.submissionId && (
                        <TrendingDown className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                </button>
            ))}
        </div>
    );
}
