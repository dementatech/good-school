'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
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

function ReportsToModal({
  title,
  positions,
  onConfirm,
  onClose,
}: {
  title: string;
  positions: Position[];
  onConfirm: (reportsToPositionId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [reportsTo, setReportsTo] = useState('');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    await onConfirm(reportsTo || null);
    setSaving(false);
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <Select
          label="Reports to (optional)"
          value={reportsTo}
          onChange={(e) => setReportsTo(e.target.value)}
          options={[
            { value: '', label: 'Not placed in the tree yet' },
            ...positions.map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <div className="flex gap-2">
          <Button type="button" isLoading={saving} onClick={() => void confirm()}>
            Add department
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomDepartmentModal({ positions, onSaved, onClose }: { positions: Position[]; onSaved: () => Promise<void> | void; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [departmentType, setDepartmentType] = useState<DepartmentType>('non_academic');
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
  const [addingCatalogEntry, setAddingCatalogEntry] = useState<DepartmentCatalogEntry | null>(null);
  const [customModal, setCustomModal] = useState(false);

  const byCatalogId = new Map(departments.filter((d) => d.catalogId).map((d) => [d.catalogId, d]));
  const academic = departments.filter((d) => d.departmentType === 'academic');
  const customNonAcademic = departments.filter((d) => d.departmentType === 'non_academic' && !d.catalogId);

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

  async function addNonAcademic(catalogId: string, reportsToPositionId: string | null) {
    const res = await submitJson('/api/v1/organization/departments/non-academic', 'POST', {
      catalogId,
      reportsToPositionId,
    });
    if (res.ok) {
      toast.success('Department added.');
      await onChanged();
      setAddingCatalogEntry(null);
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-primary-900">Academic departments</h3>
        <p className="text-xs text-text-muted">
          One per offered subject, created automatically the moment it&rsquo;s enabled on the Subjects
          &amp; Combinations page.
        </p>
        {academic.length === 0 ? (
          <p className="text-sm text-text-faint italic">None yet — offer a subject to get one.</p>
        ) : (
          <div className="space-y-1.5">
            {academic.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span>
                  <span className="font-medium">{d.name}</span>
                  <span className="text-text-faint"> — {d.subjects.map((s) => s.subjectName).join(', ')}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-primary-900">Non-academic departments</h3>
        <p className="text-xs text-text-muted">Tick which ones this school runs.</p>
        <div className="flex flex-wrap gap-2">
          {catalog.map((c) => {
            const existing = byCatalogId.get(c.id);
            return (
              <label
                key={c.id}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(existing)}
                  onChange={() => {
                    if (existing) void remove(existing.id, existing.name);
                    else setAddingCatalogEntry(c);
                  }}
                  className="rounded border-[#E5E5E5]"
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      {customNonAcademic.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-primary-900">Custom departments</h3>
          <div className="space-y-1.5">
            {customNonAcademic.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span>
                  {d.name} <Badge variant="muted">{DEPARTMENT_TYPE_LABEL[d.departmentType]}</Badge>
                </span>
                <button type="button" onClick={() => void remove(d.id, d.name)} className="text-text-faint hover:text-red-600">
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button type="button" variant="outline" onClick={() => setCustomModal(true)}>
        <Plus className="w-4 h-4 mr-1.5" aria-hidden />
        Add a custom department
      </Button>

      {addingCatalogEntry && (
        <ReportsToModal
          title={`Add ${addingCatalogEntry.name}`}
          positions={positions}
          onClose={() => setAddingCatalogEntry(null)}
          onConfirm={(reportsTo) => addNonAcademic(addingCatalogEntry.id, reportsTo)}
        />
      )}
      {customModal && (
        <CustomDepartmentModal positions={positions} onSaved={onChanged} onClose={() => setCustomModal(false)} />
      )}
    </div>
  );
}
