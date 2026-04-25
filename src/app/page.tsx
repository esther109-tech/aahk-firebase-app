"use client";

import React, { useState, useEffect } from "react";
import UploadForm from "@/components/UploadForm";
import LoginForm from "@/components/LoginForm";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { Plane, ShieldCheck, Mail, Globe, LayoutDashboard } from "lucide-react";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 selection:bg-slate-200 selection:text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 group">
            <div className="bg-slate-900 p-2 rounded-xl text-white group-hover:scale-110 transition-transform">
              <Plane className="w-5 h-5 -rotate-45" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">SkyGate Portal</span>
          </div>

          {user && (
            <div className="flex items-center space-x-4">
              <button className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center space-x-1">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
              <div className="h-4 w-px bg-slate-200"></div>
              <LoginForm userEmail={user.email} />
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden px-4">
        {/* Background Decor */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl opacity-[0.02] pointer-events-none">
          <Globe className="w-[500px] h-[500px] animate-[pulse_15s_ease-in-out_infinite]" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
            <p className="text-slate-400 font-medium italic">Preparing your portal...</p>
          </div>
        ) : !user ? (
          /* Redesigned Centered Login Landing Page */
          <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-12">
            <div className="text-left space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900/5 border border-slate-900/10 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Enterprise Upload Security</span>
                </div>
                <h1 className="text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                  Airline <span className="text-slate-400">Data</span><br />
                  Portal V2
                </h1>
                <p className="text-xl text-slate-500 leading-relaxed max-w-md">
                  A professional gateway for fleet management and information updates. Secure, fast, and unified.
                </p>
              </div>

              <div className="flex items-center space-x-6 text-sm font-medium text-slate-400">
                <div className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span>Cloud Verified</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span>Auto-Notifications</span>
                </div>
              </div>
            </div>

            <div className="animate-in fade-in zoom-in-95 duration-700 delay-200">
              <LoginForm userEmail={null} />
            </div>
          </div>
        ) : (
          /* Authenticated State: Professional Upload Area */
          <section className="w-full max-w-5xl py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-900 tracking-tight mb-4">
                Welcome Back, {user.email?.split('@')[0]}
              </h2>
              <p className="text-slate-500">Ready to submit a new airline information update for AAHK review?</p>
            </div>

            <UploadForm />

            {/* Features List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
              <FeatureCard
                icon={<UploadSVG className="w-5 h-5" />}
                title="Docx Validation"
                desc="Instant check for .docx format requirements."
              />
              <FeatureCard
                icon={<ShieldCheck className="w-5 h-5" />}
                title="Storage Encryption"
                desc="Bank-grade encryption for all uploaded assets."
              />
              <FeatureCard
                icon={<Mail className="w-5 h-5" />}
                title="Real-time Alerts"
                desc="AAHK notified as soon as you hit submit."
              />
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-2 opacity-40">
            <Plane className="w-4 h-4 -rotate-45" />
            <span className="text-sm font-medium tracking-tight">SkyGate Portal</span>
          </div>
          <p className="text-sm text-slate-400">
            &copy; 2026 Aviation Authority Hub. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
      <div className="p-3 w-fit rounded-2xl bg-slate-50 text-slate-900 mb-6 border border-slate-100">
        {icon}
      </div>
      <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function UploadSVG({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24" height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
