"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Plane, TrendingUp, Bell } from "lucide-react";

interface Props {
    isAdmin: boolean;
    alertCount?: number;
}

const links = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Overview", adminOnly: false },
    { href: "/dashboard/submissions", icon: FileText, label: "Submissions", adminOnly: false },
    { href: "/dashboard/fleet", icon: Plane, label: "Fleet", adminOnly: false },
    { href: "/dashboard/trends", icon: TrendingUp, label: "Trends", adminOnly: true },
    { href: "/dashboard/alerts", icon: Bell, label: "Alerts", adminOnly: true },
];

export default function DashboardSidebar({ isAdmin, alertCount = 0 }: Props) {
    const pathname = usePathname();

    const visible = links.filter((l) => !l.adminOnly || isAdmin);

    return (
        <aside className="w-20 shrink-0 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-2 min-h-screen">
            <div className="mb-4 w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                <Plane className="w-5 h-5 text-white -rotate-45" />
            </div>
            {visible.map(({ href, icon: Icon, label, adminOnly }) => {
                const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                const showBadge = label === "Alerts" && alertCount > 0;
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`relative flex flex-col items-center gap-1 w-16 py-3 rounded-xl transition-all text-center group ${
                            isActive
                                ? "bg-indigo-50 text-indigo-600"
                                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                    >
                        <Icon className="w-5 h-5" />
                        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
                        {showBadge && (
                            <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
                                {alertCount > 9 ? "9+" : alertCount}
                            </span>
                        )}
                    </Link>
                );
            })}
        </aside>
    );
}
