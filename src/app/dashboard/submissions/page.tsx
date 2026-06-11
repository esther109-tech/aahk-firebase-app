"use client";

import { useDashboard } from "@/lib/dashboard-context";
import SubmissionsTable from "@/components/SubmissionsTable";
import UploadForm from "@/components/UploadForm";

export default function SubmissionsPage() {
    const { user, isAdmin, tenantName, openDrawer } = useDashboard();
    if (!user) return null;
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4">
                <UploadForm />
            </div>
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 p-6 min-h-[480px]">
                <SubmissionsTable
                    user={user}
                    isAdmin={isAdmin}
                    tenantName={tenantName}
                    onSelectSubmission={openDrawer}
                />
            </div>
        </div>
    );
}
