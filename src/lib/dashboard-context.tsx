"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isUserAdmin, getAirlineFromEmail } from "@/lib/utils";

interface DashboardContextValue {
    user: User | null;
    loading: boolean;
    isAdmin: boolean;
    tenantName: string;
    selectedSubmission: any | null;
    showDrawer: boolean;
    openDrawer: (submission: any) => void;
    closeDrawer: () => void;
    openDrawerFromAircraft: (aircraft: any) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [tenantName, setTenantName] = useState("");
    const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
    const [showDrawer, setShowDrawer] = useState(false);

    useEffect(() => {
        return onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (u) {
                setIsAdmin(isUserAdmin(u.email));
                setTenantName(getAirlineFromEmail(u.email));
            } else {
                setIsAdmin(false);
                setTenantName("");
            }
            setLoading(false);
        });
    }, []);

    const openDrawer = (submission: any) => {
        setSelectedSubmission(submission);
        setShowDrawer(true);
    };

    const closeDrawer = () => {
        setShowDrawer(false);
        setSelectedSubmission(null);
    };

    const openDrawerFromAircraft = async (aircraft: any) => {
        if (aircraft.lastReportId) {
            try {
                const snap = await getDoc(doc(db, "airline-upload", aircraft.lastReportId));
                if (snap.exists()) { openDrawer({ id: snap.id, ...snap.data() }); return; }
            } catch {}
        }
        try {
            const tailQ = query(
                collection(db, "airline-upload"),
                where("extractedData.tailNumber", "==", aircraft.tailNumber),
                orderBy("createdAt", "desc"),
                limit(1)
            );
            const tailSnap = await getDocs(tailQ);
            if (!tailSnap.empty) {
                const d = tailSnap.docs[0];
                openDrawer({ id: d.id, ...d.data() });
                return;
            }
        } catch {}
        openDrawer({
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
                updateDate: aircraft.lastUpdate
                    ? new Date(aircraft.lastUpdate.seconds * 1000).toLocaleDateString()
                    : "Just Now",
                complianceStatus: aircraft.lastComplianceStatus,
                complianceReason: `Fleet Registry entry for ${aircraft.tailNumber}.`,
                confidenceScore: 100,
                summary: `Auto-generated audit profile for aircraft ${aircraft.tailNumber}.`,
            },
        });
    };

    return (
        <DashboardContext.Provider value={{
            user, loading, isAdmin, tenantName,
            selectedSubmission, showDrawer,
            openDrawer, closeDrawer, openDrawerFromAircraft,
        }}>
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard() {
    const ctx = useContext(DashboardContext);
    if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
    return ctx;
}
