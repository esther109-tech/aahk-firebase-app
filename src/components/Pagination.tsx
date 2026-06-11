"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  hasNextPage: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSize: 25 | 50 | 100;
  onPageSizeChange: (size: 25 | 50 | 100) => void;
  totalCount: number;
  label?: string;
}

export default function Pagination({
  currentPage,
  hasNextPage,
  onPrev,
  onNext,
  pageSize,
  onPageSizeChange,
  totalCount,
  label = "records",
}: PaginationProps) {
  const start = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-2">
      <span className="text-xs text-slate-400 font-medium">
        {totalCount > 0 ? `Showing ${start}–${end} of ${totalCount} ${label}` : `0 ${label}`}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-50 disabled:hover:text-slate-600 disabled:hover:border-slate-200"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>

        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 rounded-lg min-w-[2rem] text-center">
          {currentPage}
        </span>

        <button
          onClick={onNext}
          disabled={!hasNextPage}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-50 disabled:hover:text-slate-600 disabled:hover:border-slate-200"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value) as 25 | 50 | 100)}
        className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        <option value={25}>25 / page</option>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </select>
    </div>
  );
}
