"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AlertsFeed from "@/components/AlertsFeed";
import { getISOWeek } from "@/lib/utils";

export default function AlertsPage() {
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [current, setCurrent] = useState<any[]>([]);
    const [previous, setPrevious] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const currentWeek = getISOWeek(new Date());
        const prevWeek = getISOWeek(new Date(Date.now() - 7 * 24 * 3600 * 1000));

        Promise.all([
            getDocs(query(collection(db, "airline-upload"), where("status", "in", ["Pending Review", "Under Review"]))),
            getDocs(query(collection(db, "compliance-snapshots"), where("week", "in", [currentWeek, prevWeek]))),
        ]).then(([subSnap, snapSnap]) => {
            setSubmissions(subSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
            const snaps = snapSnap.docs.map((d) => d.data() as any);
            setCurrent(snaps.filter((s) => s.week === currentWeek));
            setPrevious(snaps.filter((s) => s.week === prevWeek));
            setLoading(false);
        });
    }, []);

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-900">Priority Alerts</h1>
                <p className="text-sm text-slate-400 mt-0.5">Overdue reviews, low OCR confidence, and compliance drops</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <AlertsFeed submissions={submissions} current={current} previous={previous} />
                )}
            </div>
        </div>
    );
}
