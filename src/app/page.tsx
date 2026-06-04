"use client";

import React, { useState, useEffect } from "react";
import UploadForm from "@/components/UploadForm";
import LoginForm from "@/components/LoginForm";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { isUserAdmin, getAirlineFromEmail } from "@/lib/utils";
import { 
  Plane, 
  ShieldCheck, 
  Mail, 
  Globe, 
  LayoutDashboard, 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Sparkles,
  Loader2,
  Calendar,
  Layers,
  Percent,
  Check,
  BarChart3,
  PieChart,
  TrendingUp,
  Wrench,
  ShieldAlert,
  ArrowRight
} from "lucide-react";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeTab, setActiveTab] = useState<"submissions" | "fleet">("submissions");

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsAdmin(isUserAdmin(currentUser.email));
        setTenantName(getAirlineFromEmail(currentUser.email));
      } else {
        setIsAdmin(false);
        setTenantName("");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Submissions in Real-time (Partitioned by Tenant)
  useEffect(() => {
    if (!user) {
      setSubmissions([]);
      return;
    }

    let q;
    if (isUserAdmin(user.email)) {
      // Admins see all submissions
      q = collection(db, "airline-upload");
    } else {
      // Airline staff see only their own airline's submissions
      const userAirline = getAirlineFromEmail(user.email);
      q = query(
        collection(db, "airline-upload"),
        where("airlineName", "==", userAirline)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Sort DESC by createdAt client-side
      docs.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setSubmissions(docs);
    }, (error) => {
      console.error("Firestore submissions subscription error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch Fleet Inventory in Real-time (Partitioned by Tenant)
  useEffect(() => {
    if (!user) {
      setFleet([]);
      return;
    }

    let q;
    if (isUserAdmin(user.email)) {
      // Admins see all aircraft
      q = collection(db, "fleet-inventory");
    } else {
      // Airline staff see only their own airline's fleet
      const userAirline = getAirlineFromEmail(user.email);
      q = query(
        collection(db, "fleet-inventory"),
        where("airlineName", "==", userAirline)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Sort by tail number ascending
      docs.sort((a: any, b: any) => {
        const tailA = a.tailNumber || "";
        const tailB = b.tailNumber || "";
        return tailA.localeCompare(tailB);
      });

      setFleet(docs);
    }, (error) => {
      console.error("Firestore fleet subscription error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleOpenDrawer = (submission: any) => {
    setSelectedSubmission(submission);
    setShowDrawer(true);
  };

  // Open the compliance report for an aircraft by finding its linked submission
  const handleOpenReportFromAircraft = (aircraft: any) => {
    // Attempt 1: Search by lastReportId
    let matchingSub = submissions.find(sub => sub.id === aircraft.lastReportId);
    
    // Attempt 2: Fallback search by tailNumber inside extractedData
    if (!matchingSub) {
      matchingSub = submissions.find(sub => sub.extractedData?.tailNumber === aircraft.tailNumber);
    }

    if (matchingSub) {
      handleOpenDrawer(matchingSub);
    } else {
      // Create a dynamic report representation if submission is not available
      const mockSub = {
        id: aircraft.lastReportId || `AUTO-${aircraft.tailNumber}`,
        file_name: `Automated Log for ${aircraft.tailNumber}`,
        file_content: "#",
        userEmail: "system@skygate.aero",
        fileType: "document",
        ai_extracted: true,
        status: aircraft.lastComplianceStatus === "Passed" ? "Approved" : "Action Required",
        extractedData: {
          airlineName: aircraft.airlineName,
          aircraftModel: aircraft.aircraftModel,
          tailNumber: aircraft.tailNumber,
          updateDate: aircraft.lastUpdate ? new Date(aircraft.lastUpdate.seconds * 1000).toLocaleDateString() : "Just Now",
          complianceStatus: aircraft.lastComplianceStatus,
          complianceReason: `Fleet Registry entry for ${aircraft.tailNumber} in active state of ${aircraft.status}. Last compliance sync succeeded.`,
          confidenceScore: 100,
          summary: `This is an auto-generated audit profile representing the synced fleet state for aircraft ${aircraft.tailNumber}.`
        }
      };
      handleOpenDrawer(mockSub);
    }
  };

  const getStatusBadge = (submission: any) => {
    if (!submission.ai_extracted) {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-semibold animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Processing Audit...</span>
        </span>
      );
    }

    if (submission.status === "Approved") {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Approved</span>
        </span>
      );
    }

    if (submission.status === "Action Required") {
      return (
        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-[pulse_3s_infinite]">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          <span>Action Required</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span>{submission.status || "Pending"}</span>
      </span>
    );
  };

  // Dynamic Dashboard Stats
  const totalFleetCount = fleet.length;
  const activeFleetCount = fleet.filter(f => f.status === "Active").length;
  const maintenanceFleetCount = fleet.filter(f => f.status === "In Maintenance").length;
  const complianceRate = totalFleetCount > 0 ? Math.round((activeFleetCount / totalFleetCount) * 100) : 100;

  // Radial Ring Dashoffset Calculations
  const radialRadius = 22;
  const radialCircumference = 2 * Math.PI * radialRadius;
  const radialStrokeDashoffset = radialCircumference - (complianceRate / 100) * radialCircumference;

  // Group fleet by model
  const fleetModels: { [model: string]: number } = {};
  fleet.forEach(f => {
    const model = f.aircraftModel || "Unknown";
    fleetModels[model] = (fleetModels[model] || 0) + 1;
  });
  const sortedModels = Object.entries(fleetModels).sort((a, b) => b[1] - a[1]);
  const maxModelCount = sortedModels.length > 0 ? sortedModels[0][1] : 1;

  // Percentages for status ribbon
  const activePct = totalFleetCount > 0 ? (activeFleetCount / totalFleetCount) * 100 : 0;
  const maintPct = totalFleetCount > 0 ? (maintenanceFleetCount / totalFleetCount) * 100 : 0;
  const pendingPct = totalFleetCount > 0 ? ((totalFleetCount - activeFleetCount - maintenanceFleetCount) / totalFleetCount) * 100 : 0;

  return (
    <main className="min-h-screen bg-slate-50 selection:bg-slate-200 selection:text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 group">
            <div className="bg-slate-900 p-2.5 rounded-xl text-white group-hover:scale-110 transition-transform shadow-md shadow-slate-900/10">
              <Plane className="w-5 h-5 -rotate-45" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-slate-900 tracking-tight leading-none">SkyGate Portal</span>
              {user && (
                <span className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                  {isAdmin ? "Global Administrator Console" : `${tenantName} Dashboard`}
                </span>
              )}
            </div>
          </div>

          {user && (
            <div className="flex items-center space-x-4">
              <button className="text-sm font-semibold text-slate-800 hover:text-slate-950 flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-100 transition-colors">
                <LayoutDashboard className="w-4 h-4" />
                <span>Control Center</span>
              </button>
              <div className="h-4 w-px bg-slate-200"></div>
              <LoginForm userEmail={user.email} />
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col items-center justify-start relative overflow-hidden px-4 md:px-8 py-8">
        {/* Background Decor */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl opacity-[0.015] pointer-events-none">
          <Globe className="w-[600px] h-[600px] animate-[pulse_20s_ease-in-out_infinite]" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
            <p className="text-slate-400 font-medium italic">Preparing your portal...</p>
          </div>
        ) : !user ? (
          /* Centered Login Landing Page */
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
                  <span>AI OCR Extraction</span>
                </div>
              </div>
            </div>

            <div className="animate-in fade-in zoom-in-95 duration-700 delay-200">
              <LoginForm userEmail={null} />
            </div>
          </div>
        ) : (
          /* Authenticated Dashboard Panel */
          <section className="w-full max-w-7xl py-4 animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8">
            
            {/* 1. Header welcome banner */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
              <div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isAdmin ? "Global Fleet Registry Console" : `${tenantName} Control Center`}
                </h1>
                <p className="text-slate-500 mt-1">
                  {isAdmin 
                    ? "Cross-airline operations cockpit. Monitor aggregate KPIs and compliance telemetry." 
                    : `Submit safety updates and manage registered aircraft for ${tenantName}.`}
                </p>
              </div>
              <div className="flex items-center space-x-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm self-start">
                <button
                  onClick={() => setActiveTab("submissions")}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 ${
                    activeTab === "submissions"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Submissions Log</span>
                </button>
                <button
                  onClick={() => setActiveTab("fleet")}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all duration-200 flex items-center space-x-1.5 ${
                    activeTab === "fleet"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Plane className="w-3.5 h-3.5" />
                  <span>Fleet Inventory</span>
                  {totalFleetCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold leading-none ${
                      activeTab === "fleet" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}>
                      {totalFleetCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 2. Visual KPI Metrics Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Metric Card 1: Total Registered Fleet */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between relative overflow-hidden group">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registered Fleet</p>
                  <h3 className="text-3xl font-extrabold text-slate-900">{totalFleetCount}</h3>
                  <p className="text-xs text-slate-500 font-medium">Aircraft enrolled in registry</p>
                </div>
                <div className="p-4 bg-slate-50 text-slate-700 rounded-2xl border border-slate-100 group-hover:scale-110 transition-transform">
                  <Plane className="w-6 h-6 -rotate-45" />
                </div>
              </div>

              {/* Metric Card 2: Operational Active */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between relative overflow-hidden group">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Assets</p>
                  <h3 className="text-3xl font-extrabold text-emerald-600">{activeFleetCount}</h3>
                  <p className="text-xs text-slate-500 font-medium">Fully passed compliance checks</p>
                </div>
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>

              {/* Metric Card 3: In Maintenance */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between relative overflow-hidden group">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">In Maintenance</p>
                  <h3 className="text-3xl font-extrabold text-rose-600">{maintenanceFleetCount}</h3>
                  <p className="text-xs text-slate-500 font-medium">Flagged for inspection / alerts</p>
                </div>
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 group-hover:scale-110 transition-transform">
                  <Wrench className="w-6 h-6" />
                </div>
              </div>

              {/* Metric Card 4: Compliance Rate (Dynamic Radial progress) */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-center justify-between relative overflow-hidden group">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Compliance Rate</p>
                  <h3 className="text-3xl font-extrabold text-slate-900">{complianceRate}%</h3>
                  <p className="text-xs text-slate-500 font-medium">Safety clearance threshold</p>
                </div>
                
                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r={radialRadius} className="text-slate-100" strokeWidth="4" stroke="currentColor" fill="transparent" />
                    <circle 
                      cx="32" 
                      cy="32" 
                      r={radialRadius} 
                      className={`${complianceRate > 80 ? "text-emerald-500" : complianceRate > 50 ? "text-amber-500" : "text-rose-500"} transition-all duration-1000 ease-out`} 
                      strokeWidth="4" 
                      strokeDasharray={radialCircumference} 
                      strokeDashoffset={radialStrokeDashoffset} 
                      strokeLinecap="round" 
                      stroke="currentColor" 
                      fill="transparent" 
                    />
                  </svg>
                  <span className="absolute text-[10px] font-extrabold text-slate-700">{complianceRate}%</span>
                </div>
              </div>

            </div>

            {/* 3. Sleek Custom Analytics Widget Dashboard */}
            {totalFleetCount > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-slate-900/5 border border-slate-200 p-6 rounded-3xl backdrop-blur-md">
                
                {/* Visual Chart 1: Fleet Composition (Vertical progress bar graph) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-md font-bold text-slate-900">Fleet Composition</h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">By Aircraft Model</span>
                  </div>

                  <div className="space-y-4">
                    {sortedModels.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No models registered yet.</p>
                    ) : (
                      sortedModels.map(([model, count]) => {
                        const barPct = Math.round((count / maxModelCount) * 100);
                        return (
                          <div key={model} className="space-y-1.5 group">
                            <div className="flex justify-between items-center text-xs font-semibold">
                              <span className="text-slate-700 group-hover:text-slate-950 transition-colors">{model}</span>
                              <span className="text-slate-900 font-extrabold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{count} {count === 1 ? 'aircraft' : 'aircraft'}</span>
                            </div>
                            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${barPct}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-slate-800 to-slate-950 rounded-full"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Visual Chart 2: Operational Health Progress */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm flex flex-col justify-between">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <PieChart className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-md font-bold text-slate-900">Operational Health Segment</h3>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active vs Maintenance</span>
                    </div>

                    {/* Linear Combined Stacked Progress Bar */}
                    <div className="space-y-2">
                      <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/40">
                        {activePct > 0 && (
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${activePct}%` }}
                            transition={{ duration: 0.8 }}
                            className="bg-emerald-500 h-full relative group cursor-pointer" 
                            title={`Active: ${activePct.toFixed(1)}%`}
                          />
                        )}
                        {maintPct > 0 && (
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${maintPct}%` }}
                            transition={{ duration: 0.8 }}
                            className="bg-rose-500 h-full relative group cursor-pointer border-l border-white/20" 
                            title={`In Maintenance: ${maintPct.toFixed(1)}%`}
                          />
                        )}
                        {pendingPct > 0 && (
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${pendingPct}%` }}
                            transition={{ duration: 0.8 }}
                            className="bg-amber-400 h-full relative group cursor-pointer border-l border-white/20" 
                            title={`Pending Review: ${pendingPct.toFixed(1)}%`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Breakdown descriptions with premium details */}
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      
                      {/* Active Box */}
                      <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Active</span>
                        </div>
                        <h4 className="text-xl font-extrabold text-emerald-950">{activeFleetCount}</h4>
                        <p className="text-[9px] text-emerald-600 font-semibold">{Math.round(activePct)}% of total</p>
                      </div>

                      {/* Maintenance Box */}
                      <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-[pulse_1.5s_infinite]"></span>
                          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Alerts</span>
                        </div>
                        <h4 className="text-xl font-extrabold text-rose-950">{maintenanceFleetCount}</h4>
                        <p className="text-[9px] text-rose-600 font-semibold">{Math.round(maintPct)}% of total</p>
                      </div>

                      {/* Pending Box */}
                      <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending</span>
                        </div>
                        <h4 className="text-xl font-extrabold text-amber-950">{totalFleetCount - activeFleetCount - maintenanceFleetCount}</h4>
                        <p className="text-[9px] text-amber-600 font-semibold">{Math.round(pendingPct)}% of total</p>
                      </div>

                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center pt-2 border-t border-slate-100 font-medium">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mr-1" />
                    <span>Real-time fleet state is synchronizing via AAHK automated OCR pipelines.</span>
                  </div>
                </div>

              </div>
            )}

            {/* 4. Tab Content: Submissions Grid vs Fleet Registry Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Upload module (only visible to airline users or can be used by admin) - Span 4 */}
              <div className="lg:col-span-4">
                <UploadForm />
              </div>

              {/* Right Column: Tabbed Submissions Table OR Fleet Registry - Span 8 */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/40 p-6 space-y-6 min-h-[480px]">
                
                {activeTab === "submissions" ? (
                  /* TAB 1: SUBMISSIONS LOG VIEW */
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                        <h3 className="text-lg font-bold text-slate-900">Compliance Audits Registry</h3>
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                        {submissions.length} total reports
                      </span>
                    </div>

                    {submissions.length === 0 ? (
                      <div className="py-24 text-center space-y-3">
                        <div className="inline-flex p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
                          <FileText className="w-8 h-8" />
                        </div>
                        <p className="text-slate-500 font-semibold">No compliance audits found.</p>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed">
                          Your uploaded PDF/DOCX safety forms and aircraft maintenance logs will be parsed by Gemini and visible here.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="pb-3 pl-2">Document Details</th>
                              {isAdmin && <th className="pb-3">Airline</th>}
                              <th className="pb-3">Tail Number</th>
                              <th className="pb-3">Audit State</th>
                              <th className="pb-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-sm">
                            {submissions.map((sub) => (
                              <tr key={sub.id} className="hover:bg-slate-50/40 transition-colors group">
                                <td className="py-3.5 pl-2 max-w-[180px]">
                                  <div className="flex items-center space-x-3">
                                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 group-hover:bg-white group-hover:shadow-sm transition-all flex-shrink-0">
                                      {sub.fileType === "image" ? (
                                        <ImageIcon className="w-4 h-4 text-indigo-500" />
                                      ) : (
                                        <FileText className="w-4 h-4 text-emerald-500" />
                                      )}
                                    </div>
                                    <div className="truncate min-w-0">
                                      <p className="font-semibold text-slate-900 truncate">{sub.file_name}</p>
                                      <p className="text-[10px] text-slate-400 flex items-center mt-0.5 font-medium">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {sub.createdAt
                                          ? new Date(sub.createdAt.seconds * 1000).toLocaleDateString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit"
                                            })
                                          : "Just now"}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                {isAdmin && (
                                  <td className="py-3.5 align-middle font-bold text-slate-700 text-xs">
                                    {sub.airlineName || "Global"}
                                  </td>
                                )}
                                <td className="py-3.5 align-middle">
                                  <span className="font-mono text-xs font-bold text-slate-900 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                                    {sub.extractedData?.tailNumber || sub.tailNumber || "Pending"}
                                  </span>
                                </td>
                                <td className="py-3.5 align-middle">
                                  {getStatusBadge(sub)}
                                </td>
                                <td className="py-3.5 text-right align-middle pr-1">
                                  <button
                                    onClick={() => handleOpenDrawer(sub)}
                                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-3 py-2 rounded-xl border border-slate-150 hover:border-indigo-100 transition-all shadow-xs"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Audit Report</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  /* TAB 2: FLEET INVENTORY GRID REGISTRY VIEW */
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center space-x-2">
                        <Plane className="w-5 h-5 text-indigo-500" />
                        <h3 className="text-lg font-bold text-slate-900">Active Fleet Directory</h3>
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                        {fleet.length} registered assets
                      </span>
                    </div>

                    {fleet.length === 0 ? (
                      <div className="py-24 text-center space-y-3">
                        <div className="inline-flex p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
                          <Plane className="w-8 h-8 -rotate-45" />
                        </div>
                        <p className="text-slate-500 font-semibold">No fleet aircraft registered.</p>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed">
                          Enrolled airline assets will appear here automatically once safety checks are successfully scanned and verified.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fleet.map((aircraft) => {
                          const isPassed = aircraft.lastComplianceStatus === "Passed";
                          const isAlert = aircraft.lastComplianceStatus === "Action Required";
                          
                          return (
                            <div 
                              key={aircraft.id} 
                              className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all group duration-300 relative overflow-hidden"
                            >
                              {/* Background color block for status feedback */}
                              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full filter blur-xl opacity-[0.03] ${
                                isPassed ? "bg-emerald-500" : isAlert ? "bg-rose-500" : "bg-indigo-500"
                              }`} />

                              <div className="space-y-3">
                                {/* Row 1: Tail Number & Operational State Badge */}
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-md font-extrabold text-slate-900 bg-white border border-slate-200 shadow-xs px-2.5 py-1 rounded-xl">
                                    {aircraft.tailNumber}
                                  </span>
                                  {aircraft.status === "Active" ? (
                                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                      <span>Active</span>
                                    </span>
                                  ) : aircraft.status === "In Maintenance" ? (
                                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-pulse">
                                      <Wrench className="w-3.5 h-3.5 text-rose-500" />
                                      <span>Maintenance</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
                                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                                      <span>{aircraft.status || "Unknown"}</span>
                                    </span>
                                  )}
                                </div>

                                {/* Row 2: Aircraft Specifications */}
                                <div className="space-y-1">
                                  <p className="text-xs font-extrabold text-slate-800">{aircraft.aircraftModel}</p>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center">
                                    <Layers className="w-3 h-3 mr-1 text-slate-300" />
                                    {aircraft.airlineName}
                                  </p>
                                </div>
                              </div>

                              {/* Row 3: Bottom action section */}
                              <div className="border-t border-slate-200/60 pt-4 mt-4 flex items-center justify-between">
                                <div className="text-[10px] text-slate-400">
                                  <p className="font-medium">Last Audited</p>
                                  <p className="font-bold text-slate-600 mt-0.5">
                                    {aircraft.lastUpdate 
                                      ? new Date(aircraft.lastUpdate.seconds * 1000).toLocaleDateString()
                                      : "Recently"}
                                  </p>
                                </div>

                                <button
                                  onClick={() => handleOpenReportFromAircraft(aircraft)}
                                  className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs hover:shadow transition-all"
                                >
                                  <span>View Report</span>
                                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

          </section>
        )}
      </div>

      {/* Dynamic Slide-Over Detail Drawer */}
      <AnimatePresence>
        {showDrawer && selectedSubmission && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDrawer(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40"
            />

            {/* Slide-over Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 280 }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white/95 backdrop-blur-xl shadow-2xl z-50 border-l border-slate-200 overflow-y-auto flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-slate-900 text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">AI Compliance Audit</h3>
                    <p className="text-xs text-slate-400 truncate max-w-[280px]">Ref: {selectedSubmission.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDrawer(false)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 space-y-6 flex-grow">
                {/* File Quick view */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submitted Asset</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-600 shadow-xs">
                        {selectedSubmission.fileType === "image" ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                      </div>
                      <div className="max-w-[240px]">
                        <p className="font-bold text-slate-900 text-sm truncate">{selectedSubmission.file_name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">By {selectedSubmission.userEmail}</p>
                      </div>
                    </div>
                    {selectedSubmission.file_content && selectedSubmission.file_content !== "#" && (
                      <a
                        href={selectedSubmission.file_content}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-indigo-600 hover:underline flex items-center bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg"
                      >
                        View Original
                      </a>
                    )}
                  </div>
                </div>

                {/* AI Processing State Banner */}
                {!selectedSubmission.ai_extracted ? (
                  <div className="p-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <h4 className="font-bold text-indigo-900 text-sm">Gemini AI Audit Running...</h4>
                    <p className="text-xs text-indigo-600 max-w-xs leading-relaxed">
                      We are fetching the asset, performing OCR data extraction, and analyzing security guidelines.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Compliance Status Block */}
                    {selectedSubmission.extractedData?.complianceStatus === "Passed" ? (
                      <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 flex items-start space-x-4 shadow-sm shadow-emerald-100">
                        <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-emerald-950">Aviation Compliance Passed</h4>
                          <p className="text-xs text-emerald-700 leading-relaxed mt-1">
                            {selectedSubmission.extractedData?.complianceReason || "This document complies with all verified AAHK safety guidelines and is fully registered."}
                          </p>
                        </div>
                      </div>
                    ) : selectedSubmission.extractedData?.complianceStatus === "Action Required" ? (
                      <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/60 flex items-start space-x-4 shadow-sm shadow-rose-100">
                        <div className="p-2.5 rounded-full bg-rose-100 text-rose-600 flex-shrink-0">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-rose-950">Audit Flags Raised</h4>
                          <p className="text-xs text-rose-700 leading-relaxed mt-1">
                            {selectedSubmission.extractedData?.complianceReason || "Review is requested due to missing signatures, verification checkmarks, or inconsistent fleet details."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start space-x-4">
                        <div className="p-2.5 rounded-full bg-slate-200 text-slate-600 flex-shrink-0">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800">Incomplete Audit Details</h4>
                          <p className="text-xs text-slate-600 leading-relaxed mt-1">
                            The AI could not safely determine safety compliance. Manual administrator review is requested.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Extracted Details Grid */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extracted Metadata</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-3">
                          <Plane className="w-4 h-4 text-indigo-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Airline</p>
                            <p className="font-bold text-slate-900 text-sm">{selectedSubmission.extractedData?.airlineName || "Unknown"}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-3">
                          <Layers className="w-4 h-4 text-indigo-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Model</p>
                            <p className="font-bold text-slate-900 text-sm">{selectedSubmission.extractedData?.aircraftModel || "Unknown"}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-3">
                          <ShieldCheck className="w-4 h-4 text-indigo-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tail Number</p>
                            <p className="font-bold text-slate-900 text-sm">{selectedSubmission.extractedData?.tailNumber || "Unknown"}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center space-x-3">
                          <Calendar className="w-4 h-4 text-indigo-500" />
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Report Date</p>
                            <p className="font-bold text-slate-900 text-sm">{selectedSubmission.extractedData?.updateDate || "Unknown"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Confidence Score Bar */}
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <Percent className="w-3.5 h-3.5 text-indigo-500" />
                          <span>AI Confidence Score</span>
                        </div>
                        <span className="font-extrabold text-slate-900 text-sm">{selectedSubmission.extractedData?.confidenceScore || 0}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${selectedSubmission.extractedData?.confidenceScore || 0}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full" 
                        />
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aviation Fleet Summary</h4>
                      <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl whitespace-pre-wrap">
                        {selectedSubmission.extractedData?.summary || "No description provided."}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Close Footer */}
              <div className="p-6 border-t border-slate-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowDrawer(false)}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
                >
                  Dismiss Audit Report
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
