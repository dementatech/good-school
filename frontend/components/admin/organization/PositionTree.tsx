'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Crown, Pencil, Plus, Star, Trash2, UserPlus, X } from 'lucide-react';
import type { AcademicYear, Staff } from '@/components/admin/staff/types';
import {
  POSITION_CATEGORIES,
  POSITION_CATEGORY_LABEL,
  orderAsTree,
  type Department,
  type Position,
  type PositionCategory,
} from './types';

// docs/design/organization-studio.md §1 — the org chart is just this tree,
// rendered. No separate chart data structure: walk parent_position_id,
// show each node's title and its current occupant(s).

function PositionFormModal({
  position,
  positions,
  departments,
  onSaved,
  onClose,
}: {
  /** Omit to create a new position. */
  position?: Position;
  positions: Position[];
  departments: Department[];
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const toast = useToast();
  const isEdit = Boolean(position);
  const [title, setTitle] = useState(position?.title ?? '');
  const [category, setCategory] = useState<PositionCategory>(position?.category ?? 'non_teaching');
  const [parentPositionId, setParentPositionId] = useState(position?.parentPositionId ?? '');
  const [departmentId, setDepartmentId] = useState(position?.departmentId ?? '');
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
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={[{ value: '', label: 'None' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
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

export function PositionTree({
  positions,
  departments,
  onChanged,
}: {
  positions: Position[];
  departments: Department[];
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [formModal, setFormModal] = useState<{ position?: Position } | null>(null);
  const [assignModal, setAssignModal] = useState<Position | null>(null);

  const hasLeadership = positions.some((p) => p.category === 'executive');
  const [seeding, setSeeding] = useState(false);

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

  const rows = orderAsTree(positions);

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

      {rows.length === 0 ? (
        <p className="text-sm text-text-faint italic">No positions yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map(({ position: p, depth }) => {
            const items: DropdownMenuItem[] = [
              { label: 'Edit', icon: Pencil, onClick: () => setFormModal({ position: p }) },
              { label: 'Assign holder', icon: UserPlus, onClick: () => setAssignModal(p) },
            ];
            if (p.category === 'executive') {
              items.push({
                label: p.isAcademicRoot ? 'Academics lead (current)' : 'Set as academics lead',
                icon: Star,
                disabled: p.isAcademicRoot,
                onClick: () => void setAcademicRoot(p.id),
              });
            }
            items.push({
              label: 'Remove',
              icon: Trash2,
              danger: true,
              separatorBefore: true,
              onClick: () => void remove(p),
            });

            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                style={{ marginLeft: depth * 24 }}
              >
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={p.category === 'executive' ? 'accent' : 'muted'}>
                      {POSITION_CATEGORY_LABEL[p.category]}
                    </Badge>
                    {p.isAcademicRoot && (
                      <Badge variant="success">
                        <Crown className="w-3 h-3 mr-1 inline" aria-hidden />
                        Academics lead
                      </Badge>
                    )}
                    {p.isUnique && p.holders.length === 0 && <span className="text-text-faint text-xs">Vacant</span>}
                  </span>
                  {p.departmentName && <div className="text-text-faint text-xs">{p.departmentName}</div>}
                  {p.holders.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {p.holders.map((h) => (
                        <span key={h.staffPositionId} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-xs">
                          {h.staffName}
                          <button type="button" onClick={() => void endHolder(h.staffPositionId)} className="text-text-faint hover:text-red-600">
                            <X className="w-3 h-3" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <DropdownMenu items={items} />
              </div>
            );
          })}
        </div>
      )}

      <Button type="button" variant="outline" onClick={() => setFormModal({})}>
        <Plus className="w-4 h-4 mr-1.5" aria-hidden />
        Add a position
      </Button>

      {formModal && (
        <PositionFormModal
          position={formModal.position}
          positions={positions}
          departments={departments}
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
