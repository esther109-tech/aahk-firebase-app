"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import LoginForm from "@/components/LoginForm";
import { Plane, ShieldCheck } from "lucide-react";

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        return onAuthStateChanged(auth, (user) => {
            if (user) router.replace("/dashboard");
        });
    }, [router]);

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-12">
                <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
                    <div className="flex items-center space-x-2.5">
                        <div className="bg-slate-900 p-2.5 rounded-xl text-white shadow-md shadow-slate-900/10">
                            <Plane className="w-5 h-5 -rotate-45" />
                        </div>
                        <span className="text-lg font-bold text-slate-900 tracking-tight">SkyGate Portal</span>
                    </div>
                    <div className="space-y-4">
                        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900/5 border border-slate-900/10 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Enterprise Upload Security</span>
                        </div>
                        <h1 className="text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                            Airline <span className="text-slate-400">Data</span><br />Portal V2
                        </h1>
                        <p className="text-xl text-slate-500 leading-relaxed max-w-md">
                            A professional gateway for fleet management and compliance updates. Secure, fast, and unified.
                        </p>
                    </div>
                    <div className="flex items-center space-x-6 text-sm font-medium text-slate-400">
                        <div className="flex items-center space-x-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span>Cloud Verified</span></div>
                        <div className="flex items-center space-x-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span>AI OCR Extraction</span></div>
                    </div>
                </div>
                <div className="animate-in fade-in zoom-in-95 duration-700 delay-200">
                    <LoginForm userEmail={null} />
                </div>
            </div>
        </main>
    );
}
