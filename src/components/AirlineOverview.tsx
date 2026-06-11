"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";
import { Upload, FileText, CheckCircle2, Clock, AlertTriangle, Plane } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { getISOWeek } from "@/lib/utils";
import UploadForm from "@/components/UploadForm";

interface Props { airlineName: string; }

const STATUS_STYLES: Record<string, string> = {
    "Approved":       "bg-emerald-50 text-emerald-700 border border-emerald-100",
    "Under Review":   "bg-amber-50 text-amber-700 border border-amber-100",
    "Pending Review": "bg-slate-50 text-slate-600 border border-slate-200",
    "Action Required":"bg-rose-50 text-rose-700 border border-rose-100",
};

function relTime(v: any): string {
    if (!v?.seconds) return "";
    const diff = Date.now() - v.seconds * 1000;
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function AirlineOverview({ airlineName }: Props) {
    const { openDrawer } = useDashboard();
    const [snapshot, setSnapshot] = useState<any>(null);
    const [prevSnapshot, setPrevSnapshot] = useState<any>(null);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [showUpload, setShowUpload] = useState(false);

    useEffect(() => {
        const currentWeek = getISOWeek(new Date());
        const prevWeek = getISOWeek(new Date(Date.now() - 7 * 24 * 3600 * 1000));

        getDocs(query(
            collection(db, "compliance-snapshots"),
            where("airlineName", "==", airlineName),
            where("week", "in", [currentWeek, prevWeek])
        )).then((snap) => {
            snap.docs.forEach((d) => {
                const data = d.data();
                if (data.week === currentWeek) setSnapshot(data);
                else setPrevSnapshot(data);
            });
        }).catch((err) => console.warn("AirlineOverview: could not load snapshot —", err));

        const q = query(
            collection(db, "airline-upload"),
            where("airlineName", "==", airlineName),
            orderBy("createdAt", "desc"),
            limit(10)
        );
        return onSnapshot(q, (snap) => {
            setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
    }, [airlineName]);

    const rate = snapshot?.complianceRate ?? null;
    const wow = snapshot && prevSnapshot ? Math.round((snapshot.complianceRate - prevSnapshot.complianceRate) * 10) / 10 : null;
    const active = snapshot?.compliantAircraft ?? null;
    const needAttention = snapshot ? snapshot.totalAircraft - snapshot.compliantAircraft : null;

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Hero Banner */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-7 text-white shadow-xl shadow-indigo-200/40">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-1">{airlineName}</p>
                        {rate !== null ? (
                            <>
                                <p className="text-5xl font-black leading-none">{rate.toFixed(1)}%</p>
                                <p className="text-sm text-indigo-200 mt-2">Compliance rate this week</p>
                                {wow !== null && (
                                    <span className={`inline-flex items-center gap-1 mt-2 text-xs font-bold px-2.5 py-1 rounded-full ${wow >= 0 ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
                                        {wow >= 0 ? `▲ +${wow}%` : `▼ ${wow}%`} vs last week
                                    </span>
                                )}
                            </>
                        ) : (
                            <div>
                                <p className="text-lg font-bold text-indigo-200 mt-2">Submit your first document</p>
                                <p className="text-sm text-indigo-300 mt-1">Compliance tracking will begin once a document is processed.</p>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        {active !== null && (
                            <span className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2 text-sm font-bold text-center">
                                {active} active
                            </span>
                        )}
                        {needAttention !== null && needAttention > 0 && (
                            <span className="bg-amber-400/25 rounded-xl px-4 py-2 text-sm font-bold text-amber-100 text-center">
                                {needAttention} need attention
                            </span>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Submission Feed */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-800">Recent Submissions</h2>
                    <button onClick={() => setShowUpload(true)}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                        <Upload className="w-3.5 h-3.5" /><span>Upload</span>
                    </button>
                </div>

                {submissions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex items-center justify-center mb-4">
                            <Plane className="w-7 h-7 text-indigo-300 -rotate-45" />
                        </div>
                        <p className="font-semibold text-slate-600">No submissions yet</p>
                        <p className="text-sm text-slate-400 mt-1 max-w-xs">Upload your first compliance document to start tracking fleet health.</p>
                        <button onClick={() => setShowUpload(true)}
                            className="mt-4 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
                            <Upload className="w-4 h-4" /><span>Submit Document</span>
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {submissions.map((s) => (
                            <button key={s.id} onClick={() => openDrawer(s)}
                                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50/80 transition-colors text-left group">
                                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-500 group-hover:border-indigo-100 group-hover:text-indigo-500 transition-colors">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 text-sm truncate">{s.extractedData?.tailNumber ?? "—"}</p>
                                    <p className="text-xs text-slate-400 truncate">{s.file_name}</p>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">{relTime(s.createdAt)}</span>
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${STATUS_STYLES[s.status] ?? STATUS_STYLES["Pending Review"]}`}>
                                    {s.status ?? "Pending"}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </motion.div>

            {showUpload && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <UploadForm />
                    </div>
                </div>
            )}
        </div>
    );
}
