"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";
import { Plane, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import ComplianceTrendChart from "@/components/ComplianceTrendChart";
import AirlineLeaderboard from "@/components/AirlineLeaderboard";
import AlertsFeed from "@/components/AlertsFeed";
import { getISOWeek, getWeekStart } from "@/lib/utils";

interface Snapshot {
    airlineName: string;
    week: string;
    weekStart: any;
    totalAircraft: number;
    compliantAircraft: number;
    complianceRate: number;
    pendingReviews: number;
}

function weeksAgo(n: number): Date {
    const d = getWeekStart(new Date());
    d.setDate(d.getDate() - n * 7);
    return d;
}

export default function AdminOverview() {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const cutoff = Timestamp.fromDate(weeksAgo(8));
            const [snapSnap, subSnap] = await Promise.all([
                getDocs(query(collection(db, "compliance-snapshots"), where("weekStart", ">=", cutoff))),
                getDocs(query(collection(db, "airline-upload"), where("status", "in", ["Pending Review", "Under Review"]))),
            ]);
            setSnapshots(snapSnap.docs.map((d) => d.data() as Snapshot));
            setSubmissions(subSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }
        load();
    }, []);

    const currentWeek = getISOWeek(new Date());
    const prevWeek = getISOWeek(new Date(Date.now() - 7 * 24 * 3600 * 1000));

    const current = snapshots.filter((s) => s.week === currentWeek);
    const previous = snapshots.filter((s) => s.week === prevWeek);

    const totalAircraft = current.reduce((a, s) => a + s.totalAircraft, 0);
    const totalCompliant = current.reduce((a, s) => a + s.compliantAircraft, 0);
    const overallRate = totalAircraft > 0 ? Math.round((totalCompliant / totalAircraft) * 1000) / 10 : 0;
    const pendingTotal = current.reduce((a, s) => a + s.pendingReviews, 0);

    const prevTotalAircraft = previous.reduce((a, s) => a + s.totalAircraft, 0);
    const prevCompliant = previous.reduce((a, s) => a + s.compliantAircraft, 0);
    const prevRate = prevTotalAircraft > 0 ? Math.round((prevCompliant / prevTotalAircraft) * 1000) / 10 : 0;
    const rateDelta = previous.length > 0 ? Math.round((overallRate - prevRate) * 10) / 10 : null;

    const kpis = [
        {
            label: "Total Fleet",
            value: totalAircraft || "—",
            sub: "Aircraft in registry",
            color: "indigo",
            icon: <Plane className="w-5 h-5" />,
            delta: null,
        },
        {
            label: "Overall Compliance",
            value: totalAircraft ? `${overallRate}%` : "—",
            sub: "Weighted fleet average",
            color: "emerald",
            icon: <CheckCircle2 className="w-5 h-5" />,
            delta: rateDelta,
        },
        {
            label: "Pending Reviews",
            value: pendingTotal || 0,
            sub: "Awaiting admin action",
            color: "amber",
            icon: <Clock className="w-5 h-5" />,
            delta: null,
        },
        {
            label: "Active Alerts",
            value: submissions.length,
            sub: "Overdue or flagged",
            color: "rose",
            icon: <AlertTriangle className="w-5 h-5" />,
            delta: null,
        },
    ];

    const colorMap: Record<string, { card: string; icon: string; bar: string }> = {
        indigo: { card: "border-indigo-100 shadow-indigo-50", icon: "bg-indigo-50 text-indigo-600", bar: "from-indigo-400 to-indigo-600" },
        emerald: { card: "border-emerald-100 shadow-emerald-50", icon: "bg-emerald-50 text-emerald-600", bar: "from-emerald-400 to-emerald-600" },
        amber:  { card: "border-amber-100 shadow-amber-50",   icon: "bg-amber-50 text-amber-600",   bar: "from-amber-400 to-amber-500" },
        rose:   { card: "border-rose-100 shadow-rose-50",     icon: "bg-rose-50 text-rose-600",     bar: "from-rose-400 to-rose-600" },
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi, i) => {
                    const c = colorMap[kpi.color];
                    return (
                        <motion.div key={kpi.label}
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className={`bg-white rounded-2xl border p-5 shadow-sm flex items-center justify-between ${c.card}`}>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                                <p className="text-2xl font-extrabold text-slate-900">{kpi.value}</p>
                                <div className="flex items-center gap-1.5">
                                    <p className="text-xs text-slate-400">{kpi.sub}</p>
                                    {kpi.delta !== null && (
                                        <span className={`text-[10px] font-bold ${kpi.delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                            {kpi.delta >= 0 ? `▲ +${kpi.delta}%` : `▼ ${kpi.delta}%`}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className={`p-3 rounded-xl ${c.icon}`}>{kpi.icon}</div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Compliance Trend Chart */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800">Compliance Trends</h2>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last 8 weeks · All airlines</span>
                </div>
                <ComplianceTrendChart snapshots={snapshots} />
            </motion.div>

            {/* Leaderboard + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-4">Airline Leaderboard</h2>
                    <AirlineLeaderboard current={current} previous={previous} />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                    <h2 className="font-bold text-slate-800 mb-4">Priority Alerts</h2>
                    <AlertsFeed submissions={submissions} current={current} previous={previous} truncate={5} />
                </motion.div>
            </div>
        </div>
    );
}
