"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2Icon, EyeIcon, UsersIcon } from "lucide-react";
import { createSchool, listSchools, type School } from "@/lib/api/schools";
import { ApiError } from "@/lib/api/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowDetailsDialog } from "@/components/ui/row-details-dialog";
import { SchoolAdminsPanel } from "./SchoolAdminsPanel";

export function SchoolsManager() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managingSchool, setManagingSchool] = useState<School | null>(null);
  const [viewing, setViewing] = useState<School | null>(null);

  async function refresh() {
    setSchools(await listSchools());
  }

  useEffect(() => {
    refresh().catch(() => setError("Couldn't load schools."));
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;

    setPending(true);
    setError(null);
    try {
      await createSchool(name.trim());
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the school.");
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<School>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      meta: { label: "Name" },
    },
    {
      accessorKey: "userCount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Users" />,
      meta: { label: "Users" },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      meta: {
        label: "Created",
        exportValue: (row) => new Date(row.createdAt).toLocaleDateString(),
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const actions: RowAction[] = [
          { label: "View", icon: EyeIcon, onClick: () => setViewing(row.original) },
        ];
        return (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setManagingSchool(row.original)}>
              Manage admins
            </Button>
            <DataTableRowActions actions={actions} />
          </div>
        );
      },
    },
  ];

  const totalUsers = schools?.reduce((sum, s) => sum + s.userCount, 0) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total schools" value={schools?.length ?? null} icon={Building2Icon} />
        <StatCard label="Total users" value={totalUsers} icon={UsersIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a school</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="school-name">School name</Label>
              <Input
                id="school-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Kampala High School"
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add school"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All schools ({schools?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={schools}
            rowId={(school) => school.id}
            emptyMessage="No schools yet."
            searchPlaceholder="Search schools…"
            exportFileName="schools"
          />
        </CardContent>
      </Card>

      <Dialog open={managingSchool !== null} onOpenChange={(open) => !open && setManagingSchool(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Admins — {managingSchool?.name}</DialogTitle>
          </DialogHeader>
          {managingSchool && (
            <SchoolAdminsPanel schoolId={managingSchool.id} onAdminCreated={refresh} />
          )}
        </DialogContent>
      </Dialog>

      <RowDetailsDialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name ?? ""}
        fields={[
          { label: "Users", value: viewing?.userCount },
          { label: "Created", value: viewing && new Date(viewing.createdAt).toLocaleDateString() },
        ]}
      />
    </div>
  );
}
