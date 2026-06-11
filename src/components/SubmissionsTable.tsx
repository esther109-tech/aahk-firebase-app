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
  FileText,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { AIRLINE_OPTIONS } from "@/lib/utils";
import TableFilters, {
  Filters,
  defaultFilters,
  SUBMISSION_STATUSES,
} from "./TableFilters";
import Pagination from "./Pagination";

interface SubmissionsTableProps {
  user: User;
  isAdmin: boolean;
  tenantName: string;
  onSelectSubmission: (submission: any) => void;
}

function StatusBadge({ submission }: { submission: any }) {
  if (!submission.ai_extracted) {
    return (
      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-semibold animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Processing...</span>
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
}

function ConfidenceBadge({ score }: { score: number | undefined }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const color =
    score >= 90
      ? "text-emerald-600"
      : score >= 70
      ? "text-amber-600"
      : "text-rose-500";
  return <span className={`text-xs font-bold ${color}`}>{score}%</span>;
}

export default function SubmissionsTable({
  user,
  isAdmin,
  tenantName,
  onSelectSubmission,
}: SubmissionsTableProps) {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [cursorStack, setCursorStack] = useState<DocumentSnapshot[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Firestore WHERE constraints (excludes orderBy / limit / cursor)
  const buildWhereConstraints = (): QueryConstraint[] => {
    const c: QueryConstraint[] = [];
    if (!isAdmin) {
      c.push(where("airlineName", "==", tenantName));
    } else if (filters.airline !== "All") {
      c.push(where("airlineName", "==", filters.airline));
    }
    if (filters.status !== "All") {
      c.push(where("status", "==", filters.status));
    }
    if (filters.dateFrom) {
      c.push(where("createdAt", ">=", Timestamp.fromDate(new Date(filters.dateFrom))));
    }
    if (filters.dateTo) {
      c.push(
        where("createdAt", "<=", Timestamp.fromDate(new Date(filters.dateTo + "T23:59:59")))
      );
    }
    return c;
  };

  // Count query — reruns when Firestore filters change (not on cursor navigation)
  useEffect(() => {
    const whereConstraints = buildWhereConstraints();
    const countQ = query(collection(db, "airline-upload"), ...whereConstraints);
    getCountFromServer(countQ)
      .then((snap) => setTotalCount(snap.data().count))
      .catch(() => setTotalCount(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tenantName, filters.status, filters.airline, filters.dateFrom, filters.dateTo]);

  // Paginated data query
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const whereConstraints = buildWhereConstraints();
    const cursor = cursorStack[cursorStack.length - 1];
    const constraints: QueryConstraint[] = [
      ...whereConstraints,
      orderBy("createdAt", "desc"),
      limit(pageSize + 1),
      ...(cursor ? [startAfter(cursor)] : []),
    ];

    const unsubscribe = onSnapshot(
      query(collection(db, "airline-upload"), ...constraints),
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, __snapshot: d, ...d.data() }));
        setAllRows(docs);
        setIsLoading(false);
      },
      (err) => {
        console.error("SubmissionsTable error:", err);
        if (cursorStack.length > 0) {
          // Stale cursor — reset to page 1
          setCursorStack([]);
          setCurrentPage(1);
        } else {
          setError("Failed to load submissions.");
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
          (r.extractedData?.tailNumber || r.tailNumber || "").toLowerCase().includes(q) ||
          (r.airlineName || "").toLowerCase().includes(q) ||
          (r.file_name || "").toLowerCase().includes(q)
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
          <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-900">Compliance Audits Registry</h3>
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
          {totalCount} total reports
        </span>
      </div>

      {/* Filters */}
      <TableFilters
        filters={filters}
        onChange={handleFilterChange}
        showAirlineFilter={isAdmin}
        airlineOptions={AIRLINE_OPTIONS}
        statusOptions={SUBMISSION_STATUSES}
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
            <FileText className="w-8 h-8" />
          </div>
          <p className="text-slate-500 font-semibold">No compliance audits found.</p>
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
                <th className="pb-3 pl-2">Document Details</th>
                {isAdmin && <th className="pb-3">Airline</th>}
                <th className="pb-3">Tail #</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">AI Confidence</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {displayRows.map((sub) => (
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
                                minute: "2-digit",
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
                    <StatusBadge submission={sub} />
                  </td>
                  <td className="py-3.5 align-middle">
                    <ConfidenceBadge score={sub.extractedData?.confidenceScore} />
                  </td>
                  <td className="py-3.5 text-right align-middle pr-1">
                    <button
                      onClick={() => onSelectSubmission(sub)}
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
          label="submissions"
        />
      )}
    </div>
  );
}
