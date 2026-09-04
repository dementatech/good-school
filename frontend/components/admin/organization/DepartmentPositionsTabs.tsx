'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Crown, Pencil, Plus, Star, Trash2, UserPlus, X } from 'lucide-react';
import type { AcademicYear, Staff } from '@/components/admin/staff/types';
import {
  POSITION_CATEGORIES,
  POSITION_CATEGORY_LABEL,
  type Department,
  type Position,
  type PositionCategory,
} from './types';

// One professional table per department (plus a "Leadership" table for
// positions with no department) instead of one long tree — the tabs are
// purely a display grouping over the same flat `position` rows; the
// underlying tree (parent_position_id) is unchanged and still shown via the
// "Reports to" column.

const LEADERSHIP_TAB = '__leadership__';

function PositionFormModal({
  position,
  positions,
  departments,
  defaultDepartmentId,
  onSaved,
  onClose,
}: {
  /** Omit to create a new position. */
  position?: Position;
  positions: Position[];
  departments: Department[];
  defaultDepartmentId?: string | null;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const toast = useToast();
  const isEdit = Boolean(position);
  const [title, setTitle] = useState(position?.title ?? '');
  const [category, setCategory] = useState<PositionCategory>(position?.category ?? 'non_teaching');
  const [parentPositionId, setParentPositionId] = useState(position?.parentPositionId ?? '');
  const [departmentId, setDepartmentId] = useState(position?.departmentId ?? defaultDepartmentId ?? '');
  const [isUnique, setIsUnique] = useState(position?.isUnique ?? false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      title: title.trim(),
      category,
      parentPositionId: parentPositionId || null,
      departmentId: departmentId || null,
      isUnique,
    };
    const res = isEdit
      ? await submitJson(`/api/v1/organization/positions/${position!.id}`, 'PATCH', body)
      : await submitJson('/api/v1/organization/positions', 'POST', body);
    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? 'Position updated.' : 'Position added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  const parentOptions = positions.filter((p) => p.id !== position?.id);

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit ${position!.title}` : 'Add a position'}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as PositionCategory)}
          options={POSITION_CATEGORIES.map((c) => ({ value: c, label: POSITION_CATEGORY_LABEL[c] }))}
        />
        <Select
          label="Reports to (optional)"
          value={parentPositionId}
          onChange={(e) => setParentPositionId(e.target.value)}
          options={[{ value: '', label: 'Top of the tree' }, ...parentOptions.map((p) => ({ value: p.id, label: p.title }))]}
        />
        <Select
          label="Department (optional)"
          value={departmentId ?? ''}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={[{ value: '', label: 'None (leadership)' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input type="checkbox" checked={isUnique} onChange={(e) => setIsUnique(e.target.checked)} className="rounded border-[#E5E5E5]" />
          Only one person can hold this at a time
        </label>
        <Button type="submit" isLoading={saving}>
          {isEdit ? 'Save changes' : 'Add position'}
        </Button>
      </form>
    </Modal>
  );
}

function AssignHolderModal({ position, onSaved, onClose }: { position: Position; onSaved: () => Promise<void> | void; onClose: () => void }) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [staffId, setStaffId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setStaff((await fetchList<Staff>('/api/v1/staff')).filter((s) => s.activeAssignment));
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId) {
      toast.error('Pick a staff member.');
      return;
    }
    setSaving(true);
    const res = await submitJson(`/api/v1/organization/positions/${position.id}/holders`, 'POST', {
      staffId,
      academicYearId,
      startDate,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Position assigned.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign ${position.title}`}>
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Staff member"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={[
            { value: '', label: 'Select…' },
            ...staff.map((s) => ({ value: s.userId, label: `${s.firstName} ${s.lastName} (${s.systemId ?? '—'})` })),
          ]}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Academic year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} options={years.map((y) => ({ value: y.id, label: y.yearName }))} />
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <Button type="submit" isLoading={saving}>
          Assign
        </Button>
      </form>
    </Modal>
  );
}

export function DepartmentPositionsTabs({
  positions,
  departments,
  onChanged,
}: {
  positions: Position[];
  departments: Department[];
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<string>(LEADERSHIP_TAB);
  const [formModal, setFormModal] = useState<{ position?: Position } | null>(null);
  const [assignModal, setAssignModal] = useState<Position | null>(null);
  const [seeding, setSeeding] = useState(false);

  const positionsById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const hasLeadership = positions.some((p) => p.category === 'executive');

  const tabs = useMemo(() => {
    const leadershipCount = positions.filter((p) => !p.departmentId).length;
    const departmentTabs = departments.map((d) => ({
      key: d.id,
      label: d.name,
      count: positions.filter((p) => p.departmentId === d.id).length,
    }));
    return [{ key: LEADERSHIP_TAB, label: 'Leadership', count: leadershipCount }, ...departmentTabs];
  }, [positions, departments]);

  // Derived, not stored: falls back to the first real tab whenever the
  // clicked-on `activeTab` no longer exists (e.g. its department was just
  // removed) rather than defaulting to a possibly-empty Leadership tab.
  const effectiveActiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? LEADERSHIP_TAB);

  const currentDepartmentId = effectiveActiveTab === LEADERSHIP_TAB ? null : effectiveActiveTab;
  const rows = positions.filter((p) => (p.departmentId ?? null) === currentDepartmentId);

  async function seedTemplate() {
    setSeeding(true);
    const res = await submitJson('/api/v1/organization/positions/seed-template', 'POST');
    setSeeding(false);
    if (res.ok) {
      toast.success('Leadership structure created — edit it below as needed.');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  async function setAcademicRoot(id: string) {
    const res = await submitJson(`/api/v1/organization/positions/${id}/academic-root`, 'POST');
    if (res.ok) {
      toast.success('Set as the academics lead — new subject departments will attach here.');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  async function remove(p: Position) {
    if (!confirm(`Remove ${p.title}?`)) return;
    const res = await submitJson(`/api/v1/organization/positions/${p.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Position removed.');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  async function endHolder(staffPositionId: string) {
    const endDate = new Date().toISOString().slice(0, 10);
    const res = await submitJson(`/api/v1/organization/staff-positions/${staffPositionId}/end`, 'POST', { endDate });
    if (res.ok) {
      toast.success('Position ended.');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<Position>[] = [
    {
      key: 'title',
      header: 'Position',
      value: (p) => p.title,
      render: (p) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{p.title}</span>
          {p.isAcademicRoot && (
            <Badge variant="success">
              <Crown className="w-3 h-3 mr-1 inline" aria-hidden />
              Academics lead
            </Badge>
          )}
          {p.isUnique && p.holders.length === 0 && <span className="text-text-faint text-xs italic">Vacant</span>}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      value: (p) => POSITION_CATEGORY_LABEL[p.category],
      render: (p) => <Badge variant={p.category === 'executive' ? 'accent' : 'muted'}>{POSITION_CATEGORY_LABEL[p.category]}</Badge>,
    },
    {
      key: 'reportsTo',
      header: 'Reports to',
      value: (p) => (p.parentPositionId ? (positionsById.get(p.parentPositionId)?.title ?? '') : ''),
      hideOnMobile: true,
      render: (p) => {
        const parent = p.parentPositionId ? positionsById.get(p.parentPositionId) : null;
        return parent ? parent.title : <span className="text-text-faint">Top of the tree</span>;
      },
    },
    {
      key: 'holders',
      header: 'Holder(s)',
      value: (p) => p.holders.map((h) => h.staffName).join(', '),
      render: (p) =>
        p.holders.length === 0 ? (
          <span className="text-text-faint">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {p.holders.map((h) => (
              <span key={h.staffPositionId} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-xs">
                {h.staffName}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void endHolder(h.staffPositionId);
                  }}
                  className="text-text-faint hover:text-red-600"
                  aria-label={`End ${h.staffName}'s term`}
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              </span>
            ))}
          </span>
        ),
    },
  ];

  const rowActions = (p: Position): DropdownMenuItem[] => {
    const items: DropdownMenuItem[] = [
      { label: 'Assign holder', icon: UserPlus, onClick: () => setAssignModal(p) },
      { label: 'Edit', icon: Pencil, onClick: () => setFormModal({ position: p }) },
    ];
    if (p.category === 'executive') {
      items.push({
        label: p.isAcademicRoot ? 'Academics lead (current)' : 'Set as academics lead',
        icon: Star,
        disabled: p.isAcademicRoot,
        onClick: () => void setAcademicRoot(p.id),
      });
    }
    items.push({ label: 'Remove', icon: Trash2, danger: true, separatorBefore: true, onClick: () => void remove(p) });
    return items;
  };

  return (
    <div className="space-y-4">
      {!hasLeadership && (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-muted flex items-center justify-between gap-3">
          <span>
            No leadership structure yet — start from a common secondary-school template (Head Teacher →
            Deputies → Dean/Bursar) and edit it to match this school.
          </span>
          <Button type="button" isLoading={seeding} onClick={() => void seedTemplate()}>
            Set up leadership structure
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((tab) => {
          const selected = effectiveActiveTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                selected ? 'border-primary-700 text-primary-900' : 'border-transparent text-text-muted hover:text-primary-900'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${selected ? 'text-primary-700' : 'text-text-muted/70'}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowActions={rowActions}
        rowKey={(p) => p.id}
        initialSort={{ key: 'category', direction: 'asc' }}
        searchPlaceholder="Search this department…"
        emptyMessage="No positions here yet."
        exportFileName={`positions-${effectiveActiveTab === LEADERSHIP_TAB ? 'leadership' : effectiveActiveTab}`}
        actions={
          <Button onClick={() => setFormModal({ position: undefined })}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Add position
          </Button>
        }
      />

      {formModal && (
        <PositionFormModal
          position={formModal.position}
          positions={positions}
          departments={departments}
          defaultDepartmentId={currentDepartmentId}
          onSaved={onChanged}
          onClose={() => setFormModal(null)}
        />
      )}
      {assignModal && (
        <AssignHolderModal position={assignModal} onSaved={onChanged} onClose={() => setAssignModal(null)} />
      )}
    </div>
  );
}
