'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export type SortValue = string | number | null | undefined;
export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * Click-a-heading sorting for hand-built tables (DataTable has its own).
 * `valueOf(row, key)` gives the plain value to sort by: numbers sort
 * numerically, strings case-insensitively, and empty values always sit last.
 * With no sort chosen, rows keep the order they came in.
 */
export function useTableSort<T>(rows: T[], valueOf: (row: T, key: string) => SortValue, initial: SortState | null = null) {
  // Layered: the newest clicked column first, earlier ones (up to three in
  // all) break its ties. Name A–Z, then a click on Stream, lists each stream
  // with its learners still in A–Z order.
  const [sorts, setSorts] = useState<SortState[]>(initial ? [initial] : []);
  const sorted = useMemo(() => {
    if (sorts.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const s of sorts) {
        const dir = s.direction === 'asc' ? 1 : -1;
        const va = valueOf(a, s.key);
        const vb = valueOf(b, s.key);
        const emptyA = va === null || va === undefined || va === '';
        const emptyB = vb === null || vb === undefined || vb === '';
        let diff = 0;
        if (emptyA || emptyB) diff = emptyA === emptyB ? 0 : emptyA ? 1 : -1;
        else if (typeof va === 'number' && typeof vb === 'number') diff = (va - vb) * dir;
        else diff = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true }) * dir;
        if (diff !== 0) return diff;
      }
      return 0;
    });
    // valueOf is recreated each render; rows and the sort layers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sorts]);
  /** First click sorts ascending (descending for `numeric` columns: best first), the next reverses. */
  const toggle = (key: string, numeric = false) =>
    setSorts((current) =>
      current[0]?.key === key
        ? [{ key, direction: current[0].direction === 'asc' ? 'desc' : 'asc' }, ...current.slice(1)]
        : [{ key, direction: numeric ? ('desc' as const) : ('asc' as const) }, ...current.filter((s) => s.key !== key)].slice(0, 3),
    );
  return { sorted, sort: sorts[0] ?? null, toggle };
}

/** A heading's contents as a sort button, with an arrow showing the current order. Hidden arrows when printed. */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric = false,
  className = '',
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string, numeric?: boolean) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey, numeric)}
      className={`inline-flex items-center gap-1 font-[inherit] hover:underline ${className}`}
      aria-label={`Sort by ${typeof label === 'string' ? label : sortKey}`}
    >
      {label}
      <Icon className={`w-3 h-3 shrink-0 print:hidden ${active ? '' : 'opacity-50'}`} aria-hidden />
    </button>
  );
}
