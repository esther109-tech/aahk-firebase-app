"use client";

import { useDashboard } from "@/lib/dashboard-context";
import AdminOverview from "@/components/AdminOverview";
import AirlineOverview from "@/components/AirlineOverview";

export default function DashboardPage() {
    const { isAdmin, tenantName } = useDashboard();
    return isAdmin ? <AdminOverview /> : <AirlineOverview airlineName={tenantName} />;
}
