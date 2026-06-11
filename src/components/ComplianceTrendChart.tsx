"use client";

import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer,
} from "recharts";

const AIRLINE_COLORS: Record<string, string> = {
    "Cathay Pacific":      "#6366f1",
    "Singapore Airlines":  "#10b981",
    "Emirates":            "#f59e0b",
    "Japan Airlines":      "#ef4444",
    "Qantas":              "#3b82f6",
    "Air China":           "#8b5cf6",
    "EVA Air":             "#06b6d4",
    "All Nippon Airways":  "#ec4899",
};
const FALLBACK_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#06b6d4","#ec4899"];

interface Snapshot {
    airlineName: string;
    week: string;
    complianceRate: number;
}

interface Props {
    snapshots: Snapshot[];
    height?: number;
}

export default function ComplianceTrendChart({ snapshots, height = 260 }: Props) {
    if (snapshots.length < 2) {
        return (
            <div className="flex items-center justify-center h-40 rounded-2xl border-2 border-dashed border-indigo-100 bg-indigo-50/30">
                <p className="text-sm text-slate-400 text-center">
                    Compliance trends will appear after the first week of submissions.
                </p>
            </div>
        );
    }

    const airlines = [...new Set(snapshots.map((s) => s.airlineName))];
    const weeks = [...new Set(snapshots.map((s) => s.week))].sort();

    const data = weeks.map((week) => {
        const point: Record<string, any> = { week };
        airlines.forEach((airline) => {
            const snap = snapshots.find((s) => s.week === week && s.airlineName === airline);
            point[airline] = snap?.complianceRate ?? null;
        });
        return point;
    });

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                    {airlines.map((airline, i) => {
                        const color = AIRLINE_COLORS[airline] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                        return (
                            <linearGradient key={airline} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        );
                    })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => [`${typeof v === "number" ? v.toFixed(1) : v}%`]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                {airlines.map((airline, i) => {
                    const color = AIRLINE_COLORS[airline] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                    return (
                        <Area key={airline} type="monotone" dataKey={airline} stroke={color} strokeWidth={2}
                            fill={`url(#grad-${i})`} dot={false} activeDot={{ r: 4 }} connectNulls />
                    );
                })}
            </AreaChart>
        </ResponsiveContainer>
    );
}
