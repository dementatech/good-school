"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, Trash2Icon } from "lucide-react";
import {
  createSchoolAdmin,
  deleteSchoolAdmin,
  listSchoolAdmins,
  type SchoolAdmin,
} from "@/lib/api/schoolAdmins";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowDetailsDialog } from "@/components/ui/row-details-dialog";

export function SchoolAdminsPanel({
  schoolId,
  onAdminCreated,
}: {
  schoolId: string;
  onAdminCreated?: () => void;
}) {
  const [admins, setAdmins] = useState<SchoolAdmin[] | null>(null);
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string | null; tempPassword: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<SchoolAdmin | null>(null);

  async function refresh() {
    setAdmins(await listSchoolAdmins(schoolId));
  }

  useEffect(() => {
    refresh().catch(() => setError("Couldn't load admins."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setPending(true);
    setError(null);
    setCreated(null);
    try {
      const { admin, tempPassword } = await createSchoolAdmin(schoolId, {
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
      });
      setEmail("");
      setPhoneNumber("");
      setCreated({ email: admin.email, tempPassword });
      await refresh();
      onAdminCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the admin account.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(admin: SchoolAdmin) {
    if (!confirm(`Remove admin ${admin.email}? This can't be undone.`)) return;
    setError(null);
    try {
      await deleteSchoolAdmin(schoolId, admin.id);
      await refresh();
      onAdminCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the admin.");
    }
  }

  function rowActions(admin: SchoolAdmin): RowAction[] {
    return [
      { label: "View", icon: EyeIcon, onClick: () => setViewing(admin) },
      {
        label: "Remove",
        icon: Trash2Icon,
        variant: "destructive",
        onClick: () => handleDelete(admin),
      },
    ];
  }

  const columns: ColumnDef<SchoolAdmin>[] = [
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      meta: { label: "Email" },
    },
    {
      accessorKey: "phoneNumber",
      header: "Phone",
      meta: { label: "Phone" },
      cell: ({ row }) => row.original.phoneNumber ?? "—",
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
    <div className="space-y-3">
      {created && (
        <div role="alert" className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          <p className="font-medium">
            {created.email} created — share these credentials with the school now.
          </p>
          <p className="text-muted-foreground">
            Temporary password:{" "}
            <span className="font-mono text-foreground">{created.tempPassword}</span> (shown once,
            not stored anywhere retrievable)
          </p>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`admin-email-${schoolId}`}>Email</Label>
          <Input
            id={`admin-email-${schoolId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@school.example"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`admin-phone-${schoolId}`}>Phone (optional)</Label>
          <Input
            id={`admin-phone-${schoolId}`}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add admin"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <DataTable
        columns={columns}
        data={admins}
        rowId={(admin) => admin.id}
        emptyMessage="No admins for this school yet."
        searchPlaceholder="Search admins…"
        exportFileName="school-admins"
      />

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.email ?? ""}
        fields={[
          { label: "Phone", value: viewing?.phoneNumber },
          { label: "Created", value: viewing && new Date(viewing.createdAt).toLocaleDateString() },
        ]}
      />
    </div>
  );
}
