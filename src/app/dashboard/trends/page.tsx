"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ComplianceTrendChart from "@/components/ComplianceTrendChart";

interface Snapshot {
    airlineName: string;
    week: string;
    weekStart: any;
    totalAircraft: number;
    compliantAircraft: number;
    complianceRate: number;
    pendingReviews: number;
}

function parseSnap(raw: any): Snapshot {
    return {
        airlineName: String(raw.airlineName ?? ""),
        week: String(raw.week ?? ""),
        weekStart: raw.weekStart,
        totalAircraft: Number(raw.totalAircraft ?? 0),
        compliantAircraft: Number(raw.compliantAircraft ?? 0),
        complianceRate: Number(raw.complianceRate ?? 0),
        pendingReviews: Number(raw.pendingReviews ?? 0),
    };
}

function TrendsContent() {
    const params = useSearchParams();
    const focusAirline = params.get("airline") ?? null;
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const cutoff = Timestamp.fromDate(new Date(Date.now() - 52 * 7 * 24 * 3600 * 1000));
        getDocs(query(collection(db, "compliance-snapshots"), where("weekStart", ">=", cutoff))).then((snap) => {
            setSnapshots(snap.docs.map((d) => parseSnap(d.data())));
            setLoading(false);
        });
    }, []);

    const displayed = focusAirline
        ? snapshots.filter((s) => s.airlineName === focusAirline)
        : snapshots;

    const airlines = [...new Set(snapshots.map((s) => s.airlineName))].sort();
    const weeks = [...new Set(snapshots.map((s) => s.week))].sort();

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">Compliance Trends</h1>
                    {focusAirline && <p className="text-sm text-slate-400 mt-0.5">Focused: {focusAirline}</p>}
                </div>
                <span className="text-xs text-slate-400">Last 52 weeks</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <ComplianceTrendChart snapshots={displayed} height={400} />
                )}
            </div>

            {!loading && snapshots.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h2 className="font-bold text-slate-800">Raw Data</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="text-left px-6 py-3">Week</th>
                                    {airlines.map((a) => <th key={a} className="text-right px-4 py-3">{a}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {weeks.map((week) => (
                                    <tr key={week} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-2.5 text-xs font-mono text-slate-500">{week}</td>
                                        {airlines.map((a) => {
                                            const s = snapshots.find((x) => x.week === week && x.airlineName === a);
                                            const rate = s ? Number(s.complianceRate) : null;
                                            return (
                                                <td key={a} className={`px-4 py-2.5 text-right text-xs font-semibold ${rate !== null ? (rate >= 90 ? "text-emerald-600" : rate >= 75 ? "text-amber-600" : "text-rose-600") : "text-slate-300"}`}>
                                                    {rate !== null ? `${rate.toFixed(1)}%` : "—"}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TrendsPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>}>
            <TrendsContent />
        </Suspense>
    );
}
