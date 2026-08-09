"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertCircleIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { exportToCsv, exportToExcel, exportToPdf, type ExportCell } from "@/lib/tableExport";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Lets a column declare a friendlier export/mobile-card label than its raw
// accessor key, and a plain-value getter for columns whose `cell` is custom
// JSX (badges, combined fields) rather than a plain accessorFn.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    label?: string;
    exportValue?: (row: TData) => ExportCell;
  }
}

export interface DataTableFilter<TData> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  matches: (row: TData, value: string) => boolean;
}

/**
 * Opt-in "include passwords" export column. Real passwords are never stored
 * anywhere retrievable, so the only honest way to put one in an export is to
 * generate a fresh one right at export time. Enabling the checkbox this
 * backs resets the password for every row being exported.
 */
export interface DataTablePasswordColumn<TData> {
  label?: string;
  confirmMessage?: (count: number) => string;
  fetchPasswords: (rows: TData[]) => Promise<Record<string, string>>;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  // null means "still loading" — renders skeleton rows instead of an empty state.
  data: TData[] | null;
  rowId: (row: TData) => string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  filters?: DataTableFilter<TData>[];
  mobileTitle?: (row: TData) => React.ReactNode;
  exportFileName?: string;
  passwordColumn?: DataTablePasswordColumn<TData>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const ALL_FILTER_VALUE = "__all__";

function blanksLastSort<TData>(rowA: Row<TData>, rowB: Row<TData>, columnId: string): number {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

function headerLabel<TData>(column: Column<TData, unknown>): string {
  if (column.columnDef.meta?.label) return column.columnDef.meta.label;
  if (typeof column.columnDef.header === "string") return column.columnDef.header;
  return column.id;
}

function exportValueFor<TData>(column: Column<TData, unknown>, row: TData): ExportCell {
  if (column.columnDef.meta?.exportValue) return column.columnDef.meta.exportValue(row);
  if (column.accessorFn) return column.accessorFn(row, 0) as ExportCell;
  return undefined;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  rowId,
  emptyMessage = "No results yet.",
  searchPlaceholder = "Search…",
  filters = [],
  mobileTitle,
  exportFileName,
  passwordColumn,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchInput, setSearchInput] = useState("");
  // Keeps typing responsive on larger lists: the input updates immediately
  // while the filtering work runs against the deferred value.
  const deferredSearch = useDeferredValue(searchInput);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const [includePasswords, setIncludePasswords] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [hiddenExportCols, setHiddenExportCols] = useState<Set<string>>(new Set());

  // Select-style filters narrow the data before it ever reaches the table;
  // free-text search stays on tanstack's own global-filter machinery below.
  const filteredData = useMemo(() => {
    if (!data) return [];
    if (filters.length === 0) return data;
    return data.filter((row) =>
      filters.every((filter) => {
        const chosen = activeFilters[filter.key];
        return !chosen || filter.matches(row, chosen);
      }),
    );
  }, [data, filters, activeFilters]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getRowId: rowId,
    defaultColumn: { sortingFn: blanksLastSort },
    state: { sorting, globalFilter: deferredSearch, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const totalRows = table.getFilteredRowModel().rows.length;
  const exportableColumns = useMemo(
    () => table.getAllColumns().filter((c) => c.id !== "actions"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  function clearAll() {
    setSearchInput("");
    setActiveFilters({});
  }

  async function handleExport(format: "csv" | "excel" | "pdf") {
    const chosenColumns = exportableColumns.filter((c) => !hiddenExportCols.has(c.id));
    if (chosenColumns.length === 0) {
      setExportError("Select at least one column to export.");
      return;
    }

    // Every filtered/sorted row, not just the current page.
    const exportRows = table.getFilteredRowModel().rows.map((r) => r.original);

    let passwords: Record<string, string> | null = null;
    if (passwordColumn && includePasswords) {
      const count = exportRows.length;
      const message =
        passwordColumn.confirmMessage?.(count) ??
        `This resets the password for ${count} account(s) and generates new ones — their previous password will stop working. Continue?`;
      if (!window.confirm(message)) return;

      setExportOpen(false);
      setExportError("");
      setExporting(format);
      setPasswordStatus("Resetting passwords…");
      try {
        passwords = await passwordColumn.fetchPasswords(exportRows);
      } catch {
        setExportError("Failed to reset passwords — export cancelled.");
        setExporting(null);
        setPasswordStatus(null);
        return;
      }
    } else {
      setExportOpen(false);
      setExportError("");
      setExporting(format);
    }
    setPasswordStatus(null);

    try {
      const headers = chosenColumns.map(headerLabel).concat(passwords ? [passwordColumn?.label ?? "Password"] : []);
      const cells: ExportCell[][] = exportRows.map((row) => {
        const values = chosenColumns.map((c) => exportValueFor(c, row));
        return passwords ? [...values, passwords[rowId(row)] ?? ""] : values;
      });

      if (format === "csv") exportToCsv(exportFileName ?? "export", headers, cells);
      else if (format === "excel") await exportToExcel(exportFileName ?? "export", headers, cells);
      else await exportToPdf(exportFileName ?? "export", exportFileName ?? "Export", headers, cells);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  const exportMenuAction: RowAction[] = exportFileName
    ? [
        {
          label: exporting ? "Exporting…" : "Export…",
          icon: DownloadIcon,
          disabled: exporting !== null,
          onClick: () => {
            setExportError("");
            setExportOpen(true);
          },
        },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>

        {filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => (
              <Select
                key={filter.key}
                value={activeFilters[filter.key] || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                  setActiveFilters((current) => ({
                    ...current,
                    [filter.key]: value === ALL_FILTER_VALUE || value === null ? "" : value,
                  }));
                }}
              >
                <SelectTrigger size="sm" aria-label={filter.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All {filter.label.toLowerCase()}</SelectItem>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 md:ml-auto">
          {(activeFilterCount > 0 || searchInput) && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
          )}
          {exportMenuAction.length > 0 && <DataTableRowActions actions={exportMenuAction} />}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {data === null
          ? "Loading…"
          : `${totalRows} ${totalRows === 1 ? "result" : "results"}${
              totalRows !== data.length ? ` of ${data.length}` : ""
            }`}
      </p>

      {passwordStatus && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {passwordStatus}
        </p>
      )}
      {exportError && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircleIcon className="size-4" aria-hidden /> {exportError}
        </p>
      )}

      {/* Desktop: real table, hidden on phones where it would need sideways scrolling. */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {data === null ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground">
                  {searchInput ? "No matches." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: one card per row, so nothing needs sideways scrolling on a phone. */}
      <div className="space-y-2 sm:hidden">
        {data === null ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border px-4 py-10 text-center text-muted-foreground">
            {searchInput ? "No matches." : emptyMessage}
          </div>
        ) : (
          rows.map((row) => {
            const visibleCells = row.getVisibleCells();
            const actionsCell = visibleCells.find((c) => c.column.id === "actions");
            const bodyCells = visibleCells.filter((c) => c.column.id !== "actions");
            const [titleCell, ...restCells] = bodyCells;

            return (
              <div key={row.id} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 font-medium break-words">
                    {mobileTitle
                      ? mobileTitle(row.original)
                      : titleCell &&
                        flexRender(titleCell.column.columnDef.cell, titleCell.getContext())}
                  </div>
                  {actionsCell && (
                    <div className="-mt-1 -mr-1 shrink-0">
                      {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                  {restCells.map((cell) => (
                    <div key={cell.id} className="contents">
                      <dt className="text-muted-foreground">{headerLabel(cell.column)}</dt>
                      <dd className="min-w-0 text-right break-words">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })
        )}
      </div>

      {data !== null && totalRows > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) =>
                setPagination((p) => ({ ...p, pageSize: Number(value), pageIndex: 0 }))
              }
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <span className="text-sm whitespace-nowrap text-muted-foreground">
              Page {pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {exportFileName && (
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Export</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground">COLUMNS</p>
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setHiddenExportCols(new Set())}
                      className="text-primary hover:underline"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setHiddenExportCols(new Set(exportableColumns.map((c) => c.id)))}
                      className="text-primary hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid max-h-56 grid-cols-1 gap-x-6 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {exportableColumns.map((column) => (
                    <label key={column.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!hiddenExportCols.has(column.id)}
                        onChange={() =>
                          setHiddenExportCols((current) => {
                            const next = new Set(current);
                            if (next.has(column.id)) next.delete(column.id);
                            else next.add(column.id);
                            return next;
                          })
                        }
                      />
                      {headerLabel(column)}
                    </label>
                  ))}
                </div>
              </div>

              {passwordColumn && (
                <label className="flex items-start gap-2 border-t border-border pt-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includePasswords}
                    onChange={(e) => setIncludePasswords(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Include {(passwordColumn.label ?? "password").toLowerCase()}
                    <span className="block text-xs text-muted-foreground">
                      Resets it for every exported account — their old password stops working.
                    </span>
                  </span>
                </label>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                <Button variant="outline" className="flex-1" onClick={() => void handleExport("csv")}>
                  CSV
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleExport("excel")}>
                  Excel
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void handleExport("pdf")}>
                  PDF
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Exports all {totalRows} filtered {totalRows === 1 ? "row" : "rows"}, not just this page.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
