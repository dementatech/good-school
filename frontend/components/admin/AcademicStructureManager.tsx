"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
  createAcademicLevel,
  deleteAcademicLevel,
  listAcademicLevels,
  updateAcademicLevel,
  type AcademicLevel,
  type AcademicLevelInput,
} from "@/lib/api/academicLevels";
import {
  createAcademicYear,
  deleteAcademicYear,
  listAcademicYears,
  updateAcademicYear,
  type AcademicYear,
  type AcademicYearInput,
} from "@/lib/api/academicYears";
import {
  createTerm,
  deleteTerm,
  listTerms,
  updateTerm,
  type Term,
  type TermInput,
} from "@/lib/api/terms";
import {
  createClass,
  deleteClass,
  listClasses,
  updateClass,
  type SchoolClass,
  type SchoolClassInput,
} from "@/lib/api/classes";
import {
  createStream,
  deleteStream,
  listStreams,
  updateStream,
  type Stream,
  type StreamInput,
} from "@/lib/api/streams";
import { ApiError } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableFilter } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowDetailsDialog } from "@/components/ui/row-details-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TABS = ["Levels", "Years", "Terms", "Classes", "Streams"] as const;
type Tab = (typeof TABS)[number];

export function AcademicStructureManager() {
  const [tab, setTab] = useState<Tab>("Levels");
  const [levels, setLevels] = useState<AcademicLevel[] | null>(null);
  const [years, setYears] = useState<AcademicYear[] | null>(null);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [streams, setStreams] = useState<Stream[] | null>(null);

  async function refreshAll() {
    const [l, y, t, c, s] = await Promise.all([
      listAcademicLevels(),
      listAcademicYears(),
      listTerms(),
      listClasses(),
      listStreams(),
    ]);
    setLevels(l);
    setYears(y);
    setTerms(t);
    setClasses(c);
    setStreams(s);
  }

  useEffect(() => {
    refreshAll().catch(() => {
      /* surfaced per-tab via each section's own error state */
    });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic structure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {TABS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "ghost"}
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {tab === "Levels" && <LevelsSection levels={levels} onChanged={refreshAll} />}
        {tab === "Years" && <YearsSection years={years} onChanged={refreshAll} />}
        {tab === "Terms" && (
          <TermsSection terms={terms} years={years ?? []} onChanged={refreshAll} />
        )}
        {tab === "Classes" && (
          <ClassesSection
            classes={classes}
            years={years ?? []}
            levels={levels ?? []}
            onChanged={refreshAll}
          />
        )}
        {tab === "Streams" && (
          <StreamsSection
            streams={streams}
            classes={classes ?? []}
            levels={levels ?? []}
            onChanged={refreshAll}
          />
        )}
      </CardContent>
    </Card>
  );
}

// -- Levels ---------------------------------------------------------------------

const EMPTY_LEVEL: AcademicLevelInput = { code: "", name: "", sortOrder: 0, stage: "" };

function LevelsSection({
  levels,
  onChanged,
}: {
  levels: AcademicLevel[] | null;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<AcademicLevelInput>(EMPTY_LEVEL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState<AcademicLevel | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setPending(true);
    setError(null);
    const input = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      stage: form.stage?.trim() || null,
    };
    try {
      if (editingId) {
        await updateAcademicLevel(editingId, input);
      } else {
        await createAcademicLevel(input);
      }
      setForm(EMPTY_LEVEL);
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the level.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(level: AcademicLevel) {
    setEditingId(level.id);
    setForm({
      code: level.code,
      name: level.name,
      sortOrder: level.sortOrder,
      stage: level.stage ?? "",
    });
  }

  async function handleDelete(level: AcademicLevel) {
    if (!confirm(`Remove level "${level.name}"?`)) return;
    setError(null);
    try {
      await deleteAcademicLevel(level.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the level.");
    }
  }

  function rowActions(level: AcademicLevel): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(level) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(level) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(level),
      },
    ];
  }

  const columns: ColumnDef<AcademicLevel>[] = [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      meta: { label: "Code" },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      meta: { label: "Name" },
    },
    {
      accessorKey: "stage",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
      meta: { label: "Stage" },
      cell: ({ row }) => row.original.stage ?? "—",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions actions={rowActions(row.original)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="levelCode">Code</Label>
          <Input
            id="levelCode"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="e.g. S1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="levelName">Name</Label>
          <Input
            id="levelName"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Senior One"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="levelSort">Sort order</Label>
          <Input
            id="levelSort"
            type="number"
            value={form.sortOrder ?? 0}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="levelStage">Stage (optional)</Label>
          <Input
            id="levelStage"
            value={form.stage ?? ""}
            onChange={(e) => setForm({ ...form, stage: e.target.value })}
            placeholder="e.g. secondary"
          />
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save level" : "Add level"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_LEVEL);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={levels}
        rowId={(level) => level.id}
        emptyMessage="No academic levels yet."
        searchPlaceholder="Search levels…"
        exportFileName="academic-levels"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? ""}
        fields={[
          { label: "Code", value: viewing?.code },
          { label: "Sort order", value: viewing?.sortOrder },
          { label: "Stage", value: viewing?.stage },
        ]}
      />
    </div>
  );
}

// -- Years ---------------------------------------------------------------------

const EMPTY_YEAR: AcademicYearInput = {
  yearName: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
};

function YearsSection({
  years,
  onChanged,
}: {
  years: AcademicYear[] | null;
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<AcademicYearInput>(EMPTY_YEAR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState<AcademicYear | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.yearName.trim() || !form.startDate || !form.endDate) return;
    setPending(true);
    setError(null);
    try {
      if (editingId) {
        await updateAcademicYear(editingId, form);
      } else {
        await createAcademicYear(form);
      }
      setForm(EMPTY_YEAR);
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the academic year.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(year: AcademicYear) {
    setEditingId(year.id);
    setForm({
      yearName: year.yearName,
      startDate: year.startDate,
      endDate: year.endDate,
      isCurrent: year.isCurrent,
    });
  }

  async function handleDelete(year: AcademicYear) {
    if (!confirm(`Remove academic year "${year.yearName}"?`)) return;
    setError(null);
    try {
      await deleteAcademicYear(year.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the academic year.");
    }
  }

  function rowActions(year: AcademicYear): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(year) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(year) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(year),
      },
    ];
  }

  const columns: ColumnDef<AcademicYear>[] = [
    {
      accessorKey: "yearName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
      meta: { label: "Year" },
    },
    {
      id: "dates",
      header: "Dates",
      meta: {
        label: "Dates",
        exportValue: (row) => `${row.startDate} – ${row.endDate}`,
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.startDate} – {row.original.endDate}
        </span>
      ),
    },
    {
      accessorKey: "isCurrent",
      header: "Status",
      meta: { label: "Status", exportValue: (row) => (row.isCurrent ? "Current" : "") },
      cell: ({ row }) => (row.original.isCurrent ? <Badge>Current</Badge> : null),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions actions={rowActions(row.original)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="yearName">Year name</Label>
          <Input
            id="yearName"
            value={form.yearName}
            onChange={(e) => setForm({ ...form, yearName: e.target.value })}
            placeholder="e.g. 2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yearStart">Start date</Label>
          <Input
            id="yearStart"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yearEnd">End date</Label>
          <Input
            id="yearEnd"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="yearCurrent"
            type="checkbox"
            checked={form.isCurrent ?? false}
            onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
          />
          <Label htmlFor="yearCurrent">Current year</Label>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save year" : "Add year"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_YEAR);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={years}
        rowId={(year) => year.id}
        emptyMessage="No academic years yet."
        searchPlaceholder="Search years…"
        exportFileName="academic-years"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.yearName ?? ""}
        fields={[
          { label: "Start date", value: viewing?.startDate },
          { label: "End date", value: viewing?.endDate },
          { label: "Status", value: viewing?.isCurrent ? <Badge>Current</Badge> : "—" },
        ]}
      />
    </div>
  );
}

// -- Terms ---------------------------------------------------------------------

function emptyTerm(academicYearId: string): TermInput {
  return { academicYearId, name: "", startDate: "", endDate: "", isCurrent: false };
}

function TermsSection({
  terms,
  years,
  onChanged,
}: {
  terms: Term[] | null;
  years: AcademicYear[];
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<TermInput>(emptyTerm(years[0]?.id ?? ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState<Term | null>(null);

  const yearName = useMemo(() => new Map(years.map((y) => [y.id, y.yearName])), [years]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.academicYearId || !form.name.trim() || !form.startDate || !form.endDate) return;
    setPending(true);
    setError(null);
    try {
      if (editingId) {
        await updateTerm(editingId, form);
      } else {
        await createTerm(form);
      }
      setForm(emptyTerm(form.academicYearId));
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the term.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(term: Term) {
    setEditingId(term.id);
    setForm({
      academicYearId: term.academicYearId,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
      isCurrent: term.isCurrent,
    });
  }

  async function handleDelete(term: Term) {
    if (!confirm(`Remove term "${term.name}"?`)) return;
    setError(null);
    try {
      await deleteTerm(term.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the term.");
    }
  }

  function rowActions(term: Term): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(term) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(term) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(term),
      },
    ];
  }

  const columns: ColumnDef<Term>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Term" />,
      meta: { label: "Term" },
    },
    {
      id: "year",
      header: "Year",
      meta: { label: "Year", exportValue: (row) => yearName.get(row.academicYearId) ?? "" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{yearName.get(row.original.academicYearId) ?? "—"}</span>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      meta: { label: "Dates", exportValue: (row) => `${row.startDate} – ${row.endDate}` },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.startDate} – {row.original.endDate}
        </span>
      ),
    },
    {
      accessorKey: "isCurrent",
      header: "Status",
      meta: { label: "Status", exportValue: (row) => (row.isCurrent ? "Current" : "") },
      cell: ({ row }) => (row.original.isCurrent ? <Badge>Current</Badge> : null),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions actions={rowActions(row.original)} />
        </div>
      ),
    },
  ];

  const filters: DataTableFilter<Term>[] = [
    {
      key: "year",
      label: "Academic year",
      options: years.map((y) => ({ value: y.id, label: y.yearName })),
      matches: (term, value) => term.academicYearId === value,
    },
  ];

  if (years.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an academic year first.</p>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="termYear">Academic year</Label>
          <Select
            value={form.academicYearId}
            onValueChange={(value) => setForm({ ...form, academicYearId: value ?? "" })}
          >
            <SelectTrigger id="termYear" className="w-full">
              <SelectValue placeholder="Select a year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.yearName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="termName">Term name</Label>
          <Input
            id="termName"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Term 1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="termStart">Start date</Label>
          <Input
            id="termStart"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="termEnd">End date</Label>
          <Input
            id="termEnd"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="termCurrent"
            type="checkbox"
            checked={form.isCurrent ?? false}
            onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
          />
          <Label htmlFor="termCurrent">Current term</Label>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save term" : "Add term"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyTerm(years[0]?.id ?? ""));
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={terms}
        rowId={(term) => term.id}
        filters={filters}
        emptyMessage="No terms yet."
        searchPlaceholder="Search terms…"
        exportFileName="terms"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? ""}
        fields={[
          { label: "Academic year", value: viewing && yearName.get(viewing.academicYearId) },
          { label: "Start date", value: viewing?.startDate },
          { label: "End date", value: viewing?.endDate },
          { label: "Status", value: viewing?.isCurrent ? <Badge>Current</Badge> : "—" },
        ]}
      />
    </div>
  );
}

// -- Classes ---------------------------------------------------------------------

function emptyClass(academicYearId: string, academicLevelId: string): SchoolClassInput {
  return { academicYearId, academicLevelId, hasStreams: false, classTeacherId: null };
}

function ClassesSection({
  classes,
  years,
  levels,
  onChanged,
}: {
  classes: SchoolClass[] | null;
  years: AcademicYear[];
  levels: AcademicLevel[];
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<SchoolClassInput>(
    emptyClass(years[0]?.id ?? "", levels[0]?.id ?? ""),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState<SchoolClass | null>(null);

  const yearName = useMemo(() => new Map(years.map((y) => [y.id, y.yearName])), [years]);
  const levelName = useMemo(() => new Map(levels.map((l) => [l.id, l.name])), [levels]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.academicYearId || !form.academicLevelId) return;
    setPending(true);
    setError(null);
    try {
      if (editingId) {
        await updateClass(editingId, form);
      } else {
        await createClass(form);
      }
      setForm(emptyClass(form.academicYearId, form.academicLevelId));
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the class.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(klass: SchoolClass) {
    setEditingId(klass.id);
    setForm({
      academicYearId: klass.academicYearId,
      academicLevelId: klass.academicLevelId,
      hasStreams: klass.hasStreams,
      classTeacherId: klass.classTeacherId,
    });
  }

  async function handleDelete(klass: SchoolClass) {
    if (!confirm(`Remove this class?`)) return;
    setError(null);
    try {
      await deleteClass(klass.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the class.");
    }
  }

  function rowActions(klass: SchoolClass): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(klass) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(klass) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(klass),
      },
    ];
  }

  const columns: ColumnDef<SchoolClass>[] = [
    {
      id: "level",
      header: "Level",
      meta: { label: "Level", exportValue: (row) => levelName.get(row.academicLevelId) ?? "" },
      cell: ({ row }) => levelName.get(row.original.academicLevelId) ?? "—",
    },
    {
      id: "year",
      header: "Year",
      meta: { label: "Year", exportValue: (row) => yearName.get(row.academicYearId) ?? "" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{yearName.get(row.original.academicYearId) ?? "—"}</span>
      ),
    },
    {
      accessorKey: "hasStreams",
      header: "Streams",
      meta: { label: "Streams", exportValue: (row) => (row.hasStreams ? "Yes" : "No") },
      cell: ({ row }) => (row.original.hasStreams ? <Badge variant="secondary">Yes</Badge> : "—"),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions actions={rowActions(row.original)} />
        </div>
      ),
    },
  ];

  const filters: DataTableFilter<SchoolClass>[] = [
    {
      key: "year",
      label: "Academic year",
      options: years.map((y) => ({ value: y.id, label: y.yearName })),
      matches: (klass, value) => klass.academicYearId === value,
    },
  ];

  if (years.length === 0 || levels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add at least one academic year and one academic level first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="classYear">Academic year</Label>
          <Select
            value={form.academicYearId}
            onValueChange={(value) => setForm({ ...form, academicYearId: value ?? "" })}
          >
            <SelectTrigger id="classYear" className="w-full">
              <SelectValue placeholder="Select a year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.yearName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="classLevel">Level</Label>
          <Select
            value={form.academicLevelId}
            onValueChange={(value) => setForm({ ...form, academicLevelId: value ?? "" })}
          >
            <SelectTrigger id="classLevel" className="w-full">
              <SelectValue placeholder="Select a level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="classHasStreams"
            type="checkbox"
            checked={form.hasStreams ?? false}
            onChange={(e) => setForm({ ...form, hasStreams: e.target.checked })}
          />
          <Label htmlFor="classHasStreams">Has streams</Label>
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save class" : "Add class"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyClass(years[0]?.id ?? "", levels[0]?.id ?? ""));
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={classes}
        rowId={(klass) => klass.id}
        filters={filters}
        emptyMessage="No classes yet."
        searchPlaceholder="Search classes…"
        exportFileName="classes"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing ? (levelName.get(viewing.academicLevelId) ?? "Class") : ""}
        fields={[
          { label: "Academic year", value: viewing && yearName.get(viewing.academicYearId) },
          { label: "Has streams", value: viewing?.hasStreams ? "Yes" : "No" },
        ]}
      />
    </div>
  );
}

// -- Streams ---------------------------------------------------------------------

function emptyStream(classId: string): StreamInput {
  return { classId, name: "", streamTeacherId: null };
}

function StreamsSection({
  streams,
  classes,
  levels,
  onChanged,
}: {
  streams: Stream[] | null;
  classes: SchoolClass[];
  levels: AcademicLevel[];
  onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<StreamInput>(emptyStream(classes[0]?.id ?? ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [viewing, setViewing] = useState<Stream | null>(null);

  const levelName = useMemo(() => new Map(levels.map((l) => [l.id, l.name])), [levels]);
  const classLabel = useMemo(
    () => new Map(classes.map((c) => [c.id, levelName.get(c.academicLevelId) ?? c.id])),
    [classes, levelName],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.classId || !form.name.trim()) return;
    setPending(true);
    setError(null);
    const input = { ...form, name: form.name.trim() };
    try {
      if (editingId) {
        await updateStream(editingId, input);
      } else {
        await createStream(input);
      }
      setForm(emptyStream(form.classId));
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the stream.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(stream: Stream) {
    setEditingId(stream.id);
    setForm({ classId: stream.classId, name: stream.name, streamTeacherId: stream.streamTeacherId });
  }

  async function handleDelete(stream: Stream) {
    if (!confirm(`Remove stream "${stream.name}"?`)) return;
    setError(null);
    try {
      await deleteStream(stream.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the stream.");
    }
  }

  function rowActions(stream: Stream): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(stream) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(stream) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(stream),
      },
    ];
  }

  const columns: ColumnDef<Stream>[] = [
    {
      id: "class",
      header: "Class",
      meta: { label: "Class", exportValue: (row) => classLabel.get(row.classId) ?? "" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{classLabel.get(row.original.classId)}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stream" />,
      meta: { label: "Stream" },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DataTableRowActions actions={rowActions(row.original)} />
        </div>
      ),
    },
  ];

  if (classes.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a class first.</p>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="streamClass">Class</Label>
          <Select value={form.classId} onValueChange={(value) => setForm({ ...form, classId: value ?? "" })}>
            <SelectTrigger id="streamClass" className="w-full">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classLabel.get(c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="streamName">Stream name</Label>
          <Input
            id="streamName"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. A"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save stream" : "Add stream"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyStream(classes[0]?.id ?? ""));
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={streams}
        rowId={(stream) => stream.id}
        emptyMessage="No streams yet."
        searchPlaceholder="Search streams…"
        exportFileName="streams"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? ""}
        fields={[{ label: "Class", value: viewing && classLabel.get(viewing.classId) }]}
      />
    </div>
  );
}
