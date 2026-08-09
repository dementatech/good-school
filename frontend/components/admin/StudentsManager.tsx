"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, PencilIcon, RotateCcwIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import {
  archiveStudent,
  createStudent,
  deleteStudent,
  listStudents,
  resetStudentPasswords,
  restoreStudent,
  updateStudent,
  type Student,
  type StudentInput,
} from "@/lib/api/students";
import { ApiError } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableFilter } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import { RowDetailsDialog } from "@/components/ui/row-details-dialog";

const EMPTY_FORM: StudentInput = {
  fullName: "",
  className: "",
  dateOfBirth: "",
  email: "",
  phoneNumber: "",
};

// "" -> null so an empty field clears the column instead of writing "".
function normalize(input: StudentInput): StudentInput {
  return {
    fullName: input.fullName.trim(),
    className: input.className?.trim() || null,
    dateOfBirth: input.dateOfBirth?.trim() || null,
    email: input.email?.trim() || null,
    phoneNumber: input.phoneNumber?.trim() || null,
  };
}

export function StudentsManager() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [form, setForm] = useState<StudentInput>(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ systemId: string | null; tempPassword: string } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);

  async function refresh() {
    setStudents(await listStudents());
  }

  useEffect(() => {
    refresh().catch(() => setError("Couldn't load students."));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.fullName.trim()) return;

    setPending(true);
    setError(null);
    setCreated(null);
    try {
      if (editingId) {
        await updateStudent(editingId, normalize(form));
        setEditingId(null);
      } else {
        const { student, tempPassword } = await createStudent(normalize(form));
        setCreated({ systemId: student.systemId, tempPassword });
      }
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the student.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(student: Student) {
    setCreated(null);
    setEditingId(student.userId);
    setForm({
      fullName: student.fullName,
      className: student.className ?? "",
      dateOfBirth: student.dateOfBirth ?? "",
      email: student.email ?? "",
      phoneNumber: student.phoneNumber ?? "",
    });
  }

  async function handleDelete(student: Student) {
    if (!confirm(`Permanently remove ${student.fullName} (${student.systemId})? This can't be undone.`)) {
      return;
    }
    setError(null);
    try {
      await deleteStudent(student.userId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the student.");
    }
  }

  async function handleArchiveToggle(student: Student) {
    setError(null);
    try {
      if (student.isActive) {
        await archiveStudent(student.userId);
      } else {
        await restoreStudent(student.userId);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update the student.");
    }
  }

  function rowActions(student: Student): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(student) },
      { label: "Edit", icon: PencilIcon, onClick: () => startEdit(student) },
      student.isActive
        ? { label: "Archive", icon: XCircleIcon, onClick: () => handleArchiveToggle(student) }
        : { label: "Restore", icon: RotateCcwIcon, onClick: () => handleArchiveToggle(student) },
      {
        label: "Delete",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(student),
      },
    ];
  }

  const columns: ColumnDef<Student>[] = [
    {
      accessorKey: "systemId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="System ID" />,
      meta: { label: "System ID" },
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.systemId}</span>,
    },
    {
      accessorKey: "fullName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      meta: { label: "Name" },
    },
    {
      accessorKey: "className",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Class" />,
      meta: { label: "Class" },
      cell: ({ row }) => row.original.className ?? "—",
    },
    {
      id: "contact",
      header: "Contact",
      meta: { label: "Contact", exportValue: (row) => row.email ?? row.phoneNumber ?? "" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.email ?? row.original.phoneNumber ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      meta: { label: "Status", exportValue: (row) => (row.isActive ? "Active" : "Archived") },
      cell: ({ row }) =>
        row.original.isActive ? null : <Badge variant="secondary">Archived</Badge>,
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

  const filters: DataTableFilter<Student>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "archived", label: "Archived" },
      ],
      matches: (student, value) => (value === "active" ? student.isActive : !student.isActive),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit student" : "Enroll a student"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {created && (
            <div
              role="alert"
              className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
            >
              <p className="font-medium">
                {created.systemId} created — share these credentials with the student now.
              </p>
              <p className="text-muted-foreground">
                Temporary password: <span className="font-mono text-foreground">{created.tempPassword}</span>{" "}
                (shown once, not stored anywhere retrievable)
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="e.g. Grace Nakato"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="className">Class</Label>
              <Input
                id="className"
                value={form.className ?? ""}
                onChange={(event) => setForm({ ...form, className: event.target.value })}
                placeholder="e.g. S3 Blue"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth ?? ""}
                onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumber">Phone (optional)</Label>
              <Input
                id="phoneNumber"
                value={form.phoneNumber ?? ""}
                onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : editingId ? "Save changes" : "Enroll student"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students ({students?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={students}
            rowId={(student) => student.userId}
            filters={filters}
            emptyMessage="No students enrolled yet."
            searchPlaceholder="Search students…"
            exportFileName="students"
            passwordColumn={{
              confirmMessage: (count) =>
                `This resets the password for ${count} student(s) and generates new ones — their previous password will stop working. Continue?`,
              fetchPasswords: async (rows) => {
                const map = await resetStudentPasswords(rows.map((r) => r.userId));
                return map;
              },
            }}
          />
        </CardContent>
      </Card>

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.fullName ?? ""}
        fields={[
          { label: "System ID", value: viewing?.systemId },
          { label: "Class", value: viewing?.className },
          { label: "Date of birth", value: viewing?.dateOfBirth },
          { label: "Email", value: viewing?.email },
          { label: "Phone", value: viewing?.phoneNumber },
          { label: "Enrolled", value: viewing && new Date(viewing.enrolledAt).toLocaleDateString() },
          {
            label: "Status",
            value: viewing?.isActive ? "Active" : <Badge variant="secondary">Archived</Badge>,
          },
        ]}
      />
    </div>
  );
}
