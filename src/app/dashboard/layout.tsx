"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardProvider, useDashboard } from "@/lib/dashboard-context";
import DashboardSidebar from "@/components/DashboardSidebar";
import AuditDrawer from "@/components/AuditDrawer";
import LoginForm from "@/components/LoginForm";
import { Plane } from "lucide-react";

function DashboardShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, loading, isAdmin, tenantName, selectedSubmission, showDrawer, closeDrawer } = useDashboard();

    useEffect(() => {
        if (!loading && !user) router.replace("/");
    }, [loading, user, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            </div>
        );
    }
    if (!user) return null;

    if (!isAdmin) {
        // Airline staff: minimal header, no sidebar
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex flex-col">
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
                    <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="bg-slate-900 p-2 rounded-xl text-white">
                                <Plane className="w-4 h-4 -rotate-45" />
                            </div>
                            <span className="font-bold text-slate-900">SkyGate</span>
                            <span className="text-slate-300 mx-1">|</span>
                            <span className="text-sm text-slate-500 font-medium">{tenantName}</span>
                        </div>
                        <LoginForm userEmail={user.email} />
                    </div>
                </header>
                <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
                    {children}
                </main>
                {showDrawer && selectedSubmission && (
                    <AuditDrawer submission={selectedSubmission} user={user} isAdmin={isAdmin} onClose={closeDrawer} />
                )}
            </div>
        );
    }

    // Admin: sidebar nav layout
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/20 flex">
            <DashboardSidebar isAdmin={isAdmin} />
            <div className="flex-1 flex flex-col min-w-0">
                <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20 px-8 h-14 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">Global Administrator Console</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Airport Authority Hong Kong</span>
                    </div>
                    <LoginForm userEmail={user.email} />
                </header>
                <main className="flex-1 px-8 py-8">
                    {children}
                </main>
            </div>
            {showDrawer && selectedSubmission && (
                <AuditDrawer submission={selectedSubmission} user={user} isAdmin={isAdmin} onClose={closeDrawer} />
            )}
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardProvider>
            <DashboardShell>{children}</DashboardShell>
        </DashboardProvider>
    );
}
