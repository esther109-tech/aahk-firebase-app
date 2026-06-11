"use client";

import { useRouter } from "next/navigation";

interface Snapshot {
    airlineName: string;
    complianceRate: number;
    pendingReviews: number;
    week: string;
}

interface Props {
    current: Snapshot[];
    previous: Snapshot[];
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function AirlineLeaderboard({ current, previous }: Props) {
    const router = useRouter();

    const sorted = [...current].sort((a, b) => b.complianceRate - a.complianceRate);

    const getWoW = (airline: string, currentRate: number) => {
        const prev = previous.find((p) => p.airlineName === airline);
        if (!prev) return null;
        return Math.round((currentRate - prev.complianceRate) * 10) / 10;
    };

    const rateColor = (rate: number) =>
        rate >= 90 ? "text-emerald-600" : rate >= 75 ? "text-amber-600" : "text-rose-600";

    const rateBarColor = (rate: number) =>
        rate >= 90 ? "bg-emerald-500" : rate >= 75 ? "bg-amber-400" : "bg-rose-500";

    if (sorted.length === 0) {
        return <p className="text-sm text-slate-400 italic text-center py-6">No airline data yet.</p>;
    }

    return (
        <div className="space-y-2">
            {sorted.map((snap, i) => {
                const wow = getWoW(snap.airlineName, snap.complianceRate);
                return (
                    <button key={snap.airlineName} onClick={() => router.push(`/dashboard/trends?airline=${encodeURIComponent(snap.airlineName)}`)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-indigo-50/50 transition-colors group text-left">
                        <span className="text-base w-6 text-center shrink-0">{MEDALS[i] ?? <span className="text-xs font-bold text-slate-400">{i + 1}</span>}</span>
                        <span className="text-sm font-semibold text-slate-700 w-36 truncate group-hover:text-indigo-700 transition-colors">{snap.airlineName}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${rateBarColor(snap.complianceRate)} transition-all duration-500`}
                                style={{ width: `${snap.complianceRate}%` }} />
                        </div>
                        <span className={`text-sm font-extrabold w-12 text-right ${rateColor(snap.complianceRate)}`}>
                            {snap.complianceRate.toFixed(1)}%
                        </span>
                        <span className="w-16 text-right text-xs font-medium text-slate-400">
                            {snap.pendingReviews > 0 ? `${snap.pendingReviews} pending` : ""}
                        </span>
                        {wow !== null && (
                            <span className={`text-[11px] font-bold w-14 text-right ${wow > 0 ? "text-emerald-500" : wow < 0 ? "text-rose-500" : "text-slate-400"}`}>
                                {wow > 0 ? `▲ +${wow}` : wow < 0 ? `▼ ${wow}` : "—"}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
