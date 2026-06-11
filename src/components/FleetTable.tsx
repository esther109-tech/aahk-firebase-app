"use client";

import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getCountFromServer,
  Timestamp,
  DocumentSnapshot,
  QueryConstraint,
} from "firebase/firestore";
import {
  Plane,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wrench,
  ArrowRight,
  Layers,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { AIRLINE_OPTIONS } from "@/lib/utils";
import TableFilters, {
  Filters,
  defaultFilters,
  FLEET_STATUSES,
} from "./TableFilters";
import Pagination from "./Pagination";

interface FleetTableProps {
  user: User;
  isAdmin: boolean;
  tenantName: string;
  onSelectAircraft: (aircraft: any) => void;
}

function ComplianceBadge({ status }: { status: string | undefined }) {
  if (status === "Passed") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        <span>Passed</span>
      </span>
    );
  }
  if (status === "Action Required") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-[pulse_3s_infinite]">
        <AlertTriangle className="w-3 h-3 text-rose-500" />
        <span>Action Required</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
      <Clock className="w-3 h-3 text-slate-400" />
      <span>{status || "Unknown"}</span>
    </span>
  );
}

function OperationalBadge({ status }: { status: string | undefined }) {
  if (status === "Active") {
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Active</span>
      </span>
    );
  }
  if (status === "In Maintenance") {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
        <Wrench className="w-3 h-3 text-rose-500" />
        <span>Maintenance</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
      <Clock className="w-3 h-3 text-slate-400" />
      <span>{status || "Unknown"}</span>
    </span>
  );
}

export default function FleetTable({
  user,
  isAdmin,
  tenantName,
  onSelectAircraft,
}: FleetTableProps) {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [cursorStack, setCursorStack] = useState<DocumentSnapshot[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildWhereConstraints = (): QueryConstraint[] => {
    const c: QueryConstraint[] = [];
    if (!isAdmin) {
      c.push(where("airlineName", "==", tenantName));
    } else if (filters.airline !== "All") {
      c.push(where("airlineName", "==", filters.airline));
    }
    if (filters.status !== "All") {
      c.push(where("lastComplianceStatus", "==", filters.status));
    }
    if (filters.dateFrom) {
      c.push(where("lastUpdate", ">=", Timestamp.fromDate(new Date(filters.dateFrom))));
    }
    if (filters.dateTo) {
      c.push(
        where("lastUpdate", "<=", Timestamp.fromDate(new Date(filters.dateTo + "T23:59:59")))
      );
    }
    return c;
  };

  useEffect(() => {
    const whereConstraints = buildWhereConstraints();
    const countQ = query(collection(db, "fleet-inventory"), ...whereConstraints);
    getCountFromServer(countQ)
      .then((snap) => setTotalCount(snap.data().count))
      .catch(() => setTotalCount(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tenantName, filters.status, filters.airline, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const whereConstraints = buildWhereConstraints();
    const cursor = cursorStack[cursorStack.length - 1];
    const constraints: QueryConstraint[] = [
      ...whereConstraints,
      orderBy("tailNumber", "asc"),
      limit(pageSize + 1),
      ...(cursor ? [startAfter(cursor)] : []),
    ];

    const unsubscribe = onSnapshot(
      query(collection(db, "fleet-inventory"), ...constraints),
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, __snapshot: d, ...d.data() }));
        setAllRows(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error("FleetTable error:", err);
        if (cursorStack.length > 0) {
          setCursorStack([]);
          setCurrentPage(1);
        } else {
          setError("Failed to load fleet inventory.");
        }
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tenantName, filters.status, filters.airline, filters.dateFrom, filters.dateTo, pageSize, cursorStack]);

  const hasNextPage = allRows.length > pageSize;
  const visibleRows = allRows.slice(0, pageSize);

  const q = filters.searchQuery.toLowerCase();
  const displayRows = q
    ? visibleRows.filter(
        (r) =>
          (r.tailNumber || "").toLowerCase().includes(q) ||
          (r.airlineName || "").toLowerCase().includes(q) ||
          (r.aircraftModel || "").toLowerCase().includes(q)
      )
    : visibleRows;

  const handleFilterChange = (newFilters: Filters) => {
    setCursorStack([]);
    setCurrentPage(1);
    setFilters(newFilters);
  };

  const handlePageSizeChange = (size: 25 | 50 | 100) => {
    setCursorStack([]);
    setCurrentPage(1);
    setPageSize(size);
  };

  const handleNext = () => {
    const lastSnap = visibleRows[visibleRows.length - 1]?.__snapshot;
    if (!lastSnap) return;
    setCursorStack((prev) => [...prev, lastSnap]);
    setCurrentPage((p) => p + 1);
  };

  const handlePrev = () => {
    setCursorStack((prev) => prev.slice(0, -1));
    setCurrentPage((p) => p - 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-2">
          <Plane className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-bold text-slate-900">Active Fleet Directory</h3>
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
          {totalCount} registered assets
        </span>
      </div>

      {/* Filters */}
      <TableFilters
        filters={filters}
        onChange={handleFilterChange}
        showAirlineFilter={isAdmin}
        airlineOptions={AIRLINE_OPTIONS}
        statusOptions={FLEET_STATUSES}
      />

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-rose-700">{error}</span>
          <button
            onClick={() => { setError(null); setCursorStack([]); setCurrentPage(1); }}
            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !error && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse border border-slate-100" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && displayRows.length === 0 && (
        <div className="py-20 text-center space-y-3">
          <div className="inline-flex p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
            <Plane className="w-8 h-8 -rotate-45" />
          </div>
          <p className="text-slate-500 font-semibold">No fleet aircraft found.</p>
          {(filters.status !== "All" || filters.airline !== "All" || filters.searchQuery) && (
            <button
              onClick={() => handleFilterChange(defaultFilters)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && displayRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="pb-3 pl-2">Tail #</th>
                {isAdmin && <th className="pb-3">Airline</th>}
                <th className="pb-3">Model</th>
                <th className="pb-3">Operational</th>
                <th className="pb-3">Compliance</th>
                <th className="pb-3">Last Synced</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {displayRows.map((aircraft) => (
                <tr key={aircraft.id} className="hover:bg-slate-50/40 transition-colors group">
                  <td className="py-3.5 pl-2">
                    <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                      {aircraft.tailNumber}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-3.5 align-middle">
                      <div className="flex items-center space-x-1 text-xs font-bold text-slate-700">
                        <Layers className="w-3 h-3 text-slate-300" />
                        <span>{aircraft.airlineName}</span>
                      </div>
                    </td>
                  )}
                  <td className="py-3.5 align-middle text-xs font-semibold text-slate-800">
                    {aircraft.aircraftModel || "—"}
                  </td>
                  <td className="py-3.5 align-middle">
                    <OperationalBadge status={aircraft.status} />
                  </td>
                  <td className="py-3.5 align-middle">
                    <ComplianceBadge status={aircraft.lastComplianceStatus} />
                  </td>
                  <td className="py-3.5 align-middle text-[10px] font-medium text-slate-400">
                    {aircraft.lastUpdate
                      ? new Date(aircraft.lastUpdate.seconds * 1000).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="py-3.5 text-right align-middle pr-1">
                    <button
                      onClick={() => onSelectAircraft(aircraft)}
                      className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs hover:shadow transition-all"
                    >
                      <span>View Report</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && totalCount > 0 && (
        <Pagination
          currentPage={currentPage}
          hasNextPage={hasNextPage}
          onPrev={handlePrev}
          onNext={handleNext}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          totalCount={totalCount}
          label="aircraft"
        />
      )}
    </div>
  );
}
