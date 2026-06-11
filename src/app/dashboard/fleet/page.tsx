"use client";

import { useDashboard } from "@/lib/dashboard-context";
import FleetTable from "@/components/FleetTable";

export default function FleetPage() {
    const { user, isAdmin, tenantName, openDrawerFromAircraft } = useDashboard();
    if (!user) return null;
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 p-6 min-h-[480px]">
            <FleetTable
                user={user}
                isAdmin={isAdmin}
                tenantName={tenantName}
                onSelectAircraft={openDrawerFromAircraft}
            />
        </div>
    );
}
