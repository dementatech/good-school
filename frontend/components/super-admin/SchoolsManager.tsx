"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeIcon, PlusIcon } from "lucide-react";
import { listSchools, type School } from "@/lib/api/schools";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table-row-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RowDetailsDialog } from "@/components/ui/row-details-dialog";
import { SchoolAdminsPanel } from "./SchoolAdminsPanel";

export function SchoolsManager() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managingSchool, setManagingSchool] = useState<School | null>(null);
  const [viewing, setViewing] = useState<School | null>(null);

  async function refresh() {
    setSchools(await listSchools());
  }

  useEffect(() => {
    refresh().catch(() => setError("Couldn't load schools."));
  }, []);

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

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>All schools ({schools?.length ?? 0})</CardTitle>
          <CardAction>
            <Button render={<Link href="/super-admin/schools/new" />}>
              <PlusIcon />
              Onboard a school
            </Button>
          </CardAction>
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
