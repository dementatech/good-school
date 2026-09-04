'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { Plus, Trash2 } from 'lucide-react';
import {
  DEPARTMENT_TYPE_LABEL,
  type Department,
  type DepartmentCatalogEntry,
  type DepartmentType,
  type Position,
} from './types';

// docs/design/departments-module.md §2-3 — academic departments auto-generate
// one-per-subject (read-only here, driven from the Subjects & Combinations
// page); non-academic departments are a catalog toggle-list with a custom-add
// secondary path, each one asking "who does this report to?" as part of
// turning it on (organization-studio.md §3).

function headOfDepartment(department: Department, positions: Position[]): string {
  const head = positions.find((p) => p.id === department.headOfDepartmentPositionId);
  if (!head || head.holders.length === 0) return 'Vacant';
  return head.holders.map((h) => h.staffName).join(', ');
}

function AddFromCatalogModal({
  available,
  positions,
  onSaved,
  onClose,
}: {
  available: DepartmentCatalogEntry[];
  positions: Position[];
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [catalogId, setCatalogId] = useState('');
  const [reportsTo, setReportsTo] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!catalogId) {
      toast.error('Pick a department.');
      return;
    }
    setSaving(true);
    const res = await submitJson('/api/v1/organization/departments/non-academic', 'POST', {
      catalogId,
      reportsToPositionId: reportsTo || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Department added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add a department from the catalog">
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Department"
          value={catalogId}
          onChange={(e) => setCatalogId(e.target.value)}
          options={[{ value: '', label: 'Select…' }, ...available.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select
          label="Reports to (optional)"
          value={reportsTo}
          onChange={(e) => setReportsTo(e.target.value)}
          options={[
            { value: '', label: 'Not placed in the tree yet' },
            ...positions.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <Button type="submit" isLoading={saving}>
          Add department
        </Button>
      </form>
    </Modal>
  );
}

function CustomDepartmentModal({
  positions,
  defaultType,
  onSaved,
  onClose,
}: {
  positions: Position[];
  defaultType: DepartmentType;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [departmentType, setDepartmentType] = useState<DepartmentType>(defaultType);
  const [reportsTo, setReportsTo] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson('/api/v1/organization/departments/custom', 'POST', {
      name: name.trim(),
      departmentType,
      reportsToPositionId: reportsTo || null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Department added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add a custom department">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select
          label="Type"
          value={departmentType}
          onChange={(e) => setDepartmentType(e.target.value as DepartmentType)}
          options={[
            { value: 'non_academic', label: DEPARTMENT_TYPE_LABEL.non_academic },
            { value: 'academic', label: DEPARTMENT_TYPE_LABEL.academic },
          ]}
        />
        <Select
          label="Reports to (optional)"
          value={reportsTo}
          onChange={(e) => setReportsTo(e.target.value)}
          options={[
            { value: '', label: 'Not placed in the tree yet' },
            ...positions.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <Button type="submit" isLoading={saving}>
          Add department
        </Button>
      </form>
    </Modal>
  );
}

export function DepartmentsPanel({
  departments,
  catalog,
  positions,
  onChanged,
}: {
  departments: Department[];
  catalog: DepartmentCatalogEntry[];
  positions: Position[];
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<DepartmentType>('academic');
  const [catalogModal, setCatalogModal] = useState(false);
  const [customModal, setCustomModal] = useState(false);

  const usedCatalogIds = new Set(departments.filter((d) => d.catalogId).map((d) => d.catalogId));
  const availableCatalog = catalog.filter((c) => !usedCatalogIds.has(c.id));

  const tabs = [
    { key: 'academic', label: 'Academic', count: departments.filter((d) => d.departmentType === 'academic').length },
    {
      key: 'non_academic',
      label: 'Non-Academic',
      count: departments.filter((d) => d.departmentType === 'non_academic').length,
    },
  ];
  const visibleDepartments = departments.filter((d) => d.departmentType === activeTab);

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name}? This only works if nobody currently holds a position in it.`)) return;
    const res = await submitJson(`/api/v1/organization/departments/${id}`, 'DELETE');
    if (res.ok) {
      toast.success('Department removed.');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<Department>[] = [
    {
      key: 'name',
      header: 'Department',
      value: (d) => d.name,
      render: (d) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{d.name}</span>
          {d.catalogId === null && d.subjects.length === 0 && <Badge variant="muted">Custom</Badge>}
        </span>
      ),
    },
    {
      key: 'subjects',
      header: 'Subject(s)',
      value: (d) => d.subjects.map((s) => s.subjectName).join(', '),
      hideOnMobile: true,
      render: (d) => (d.subjects.length > 0 ? d.subjects.map((s) => s.subjectCode).join(', ') : <span className="text-text-faint">—</span>),
    },
    {
      key: 'head',
      header: 'Head of department',
      value: (d) => headOfDepartment(d, positions),
      render: (d) => {
        const label = headOfDepartment(d, positions);
        return label === 'Vacant' ? <span className="text-text-faint italic">Vacant</span> : label;
      },
    },
  ];

  const rowActions = (d: Department): DropdownMenuItem[] => [
    { label: 'Remove', icon: Trash2, danger: true, onClick: () => void remove(d.id, d.name) },
  ];

  return (
    <div className="space-y-3">
      <Tabs tabs={tabs} active={activeTab} onChange={(key) => setActiveTab(key as DepartmentType)} />

      <DataTable
        rows={visibleDepartments}
        columns={columns}
        rowActions={rowActions}
        rowKey={(d) => d.id}
        initialSort={{ key: 'name', direction: 'asc' }}
        searchPlaceholder="Search departments…"
        emptyMessage={
          activeTab === 'academic'
            ? 'No academic departments yet — offer a subject to get one.'
            : 'No non-academic departments yet — add one below.'
        }
        exportFileName={`departments-${activeTab}`}
        actions={
          activeTab === 'non_academic' ? (
            <Button onClick={() => setCatalogModal(true)} disabled={availableCatalog.length === 0}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              Add from catalog
            </Button>
          ) : undefined
        }
        secondaryActions={[{ label: 'Add a custom department', icon: Plus, onClick: () => setCustomModal(true) }]}
      />

      {catalogModal && (
        <AddFromCatalogModal
          available={availableCatalog}
          positions={positions}
          onSaved={onChanged}
          onClose={() => setCatalogModal(false)}
        />
      )}
      {customModal && (
        <CustomDepartmentModal
          positions={positions}
          defaultType={activeTab}
          onSaved={onChanged}
          onClose={() => setCustomModal(false)}
        />
      )}
    </div>
  );
}
