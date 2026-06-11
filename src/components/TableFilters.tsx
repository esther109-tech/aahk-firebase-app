"use client";

import { Search, X } from "lucide-react";

export interface Filters {
  searchQuery: string;
  status: string;
  airline: string;
  dateFrom: string;
  dateTo: string;
}

export const defaultFilters: Filters = {
  searchQuery: "",
  status: "All",
  airline: "All",
  dateFrom: "",
  dateTo: "",
};

export const SUBMISSION_STATUSES = [
  "All",
  "Pending Review",
  "Under Review",
  "Approved",
  "Action Required",
];

export const FLEET_STATUSES = ["All", "Passed", "Action Required", "Unknown"];

interface TableFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  showAirlineFilter: boolean;
  airlineOptions: string[];
  statusOptions?: string[];
}

export default function TableFilters({
  filters,
  onChange,
  showAirlineFilter,
  airlineOptions,
  statusOptions = SUBMISSION_STATUSES,
}: TableFiltersProps) {
  const hasActiveFilters =
    filters.status !== "All" ||
    filters.airline !== "All" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.searchQuery !== "";

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50/60 rounded-xl border border-slate-100">
      <div className="relative flex-1 min-w-[160px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tail #, file, airline..."
          value={filters.searchQuery}
          onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400"
        />
      </div>

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
        className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {showAirlineFilter && (
        <select
          value={filters.airline}
          onChange={(e) => onChange({ ...filters, airline: e.target.value })}
          className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="All">All Airlines</option>
          {airlineOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        title="From date"
        className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        title="To date"
        className="text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />

      {hasActiveFilters && (
        <button
          onClick={() => onChange(defaultFilters)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white border border-slate-200 hover:border-rose-200 px-2.5 py-1.5 rounded-lg transition-all"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
