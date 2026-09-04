'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Camera, Trash2, X } from 'lucide-react';
import type { CatalogSubject } from '@/components/admin/subjects/types';
import type { Position, StaffPosition } from '@/components/admin/organization/types';
import { StaffAvatar } from './StaffAvatar';
import { DocumentsPanel } from './DocumentsPanel';
import {
  EMPLOYMENT_BASIS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  ENTRY_TYPE_LABEL,
  ENTRY_TYPES,
  EXIT_TYPE_LABEL,
  EXIT_TYPES,
  STAFF_CATEGORY_LABEL,
  STAFF_ROLE_LABEL,
  STAFF_ROLES,
  TMIS_STATUS_LABEL,
  staffFullName,
  type AcademicYear,
  type AssignmentEntryType,
  type AssignmentExitType,
  type Staff,
  type StaffAssignment,
  type StaffRole,
  type StaffSpecialization,
  type SubjectTeacherAssignment,
} from './types';

function PhotoEditor({ staff, onChanged }: { staff: Staff; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  // Local override so the avatar updates the moment an upload succeeds,
  // rather than waiting on the parent list's refetch to flow a new `staff`
  // prop back down here (the modal doesn't get closed/reopened just for this).
  const [photoUrl, setPhotoUrl] = useState(staff.photoUrl);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/v1/staff/${staff.userId}/photo`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) {
        setPhotoUrl(json.data.photoUrl);
        await onChanged();
      } else {
        toast.error(json.error ?? 'Could not upload photo.');
      }
    } catch {
      toast.error('Network error while uploading photo.');
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    const res = await submitJson<Staff>(`/api/v1/staff/${staff.userId}/photo`, 'DELETE');
    if (res.ok) {
      setPhotoUrl(null);
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <StaffAvatar photoUrl={photoUrl} name={staffFullName(staff)} size="lg" />
      <div className="flex flex-col gap-2">
        <label className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 cursor-pointer hover:underline">
          <Camera className="w-4 h-4" aria-hidden />
          {uploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </label>
        {photoUrl && (
          <button
            type="button"
            onClick={() => void remove()}
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-red-600"
          >
            <X className="w-4 h-4" aria-hidden />
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}

function AssignPositionForm({ staff, positions, onDone }: { staff: Staff; positions: Position[]; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!positionId) {
      toast.error('Pick a position.');
      return;
    }
    setSaving(true);
    const res = await submitJson(`/api/v1/organization/positions/${positionId}/holders`, 'POST', {
      staffId: staff.userId,
      academicYearId,
      startDate,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Position assigned.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <Select
        label="Position"
        value={positionId}
        onChange={(e) => setPositionId(e.target.value)}
        options={[
          { value: '', label: 'Select a position…' },
          ...positions.map((p) => ({
            value: p.id,
            label: p.departmentName ? `${p.title} (${p.departmentName})` : p.title,
          })),
        ]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Academic year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} options={years.map((y) => ({ value: y.id, label: y.yearName }))} />
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      <Button type="submit" isLoading={saving}>
        Assign position
      </Button>
    </form>
  );
}

function PositionsPanel({ staff, onChanged }: { staff: Staff; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [staffPositions, setStaffPositions] = useState<StaffPosition[] | null>(null);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [showAssign, setShowAssign] = useState(false);

  const load = async () => {
    setStaffPositions(await fetchList<StaffPosition>(`/api/v1/organization/staff/${staff.userId}/positions`));
    setAllPositions(await fetchList<Position>('/api/v1/organization/positions'));
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.userId]);

  async function end(staffPositionId: string) {
    const endDate = new Date().toISOString().slice(0, 10);
    const res = await submitJson(`/api/v1/organization/staff-positions/${staffPositionId}/end`, 'POST', { endDate });
    if (res.ok) {
      toast.success('Position ended.');
      await load();
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  const active = staffPositions?.filter((p) => p.status === 'active') ?? [];

  return (
    <div className="space-y-2">
      {staffPositions === null ? (
        <p className="text-sm text-text-faint">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-text-faint">
          No position in the org chart yet — see{' '}
          <span className="font-medium">Organisation Studio</span> to set up departments first.
        </p>
      ) : (
        <div className="space-y-1.5">
          {active.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-t border-border pt-1.5 first:border-0 first:pt-0">
              <span>
                {p.title}
                {p.departmentName ? ` — ${p.departmentName}` : ''}
              </span>
              <Button type="button" variant="outline" inline onClick={() => void end(p.id)}>
                End
              </Button>
            </div>
          ))}
        </div>
      )}
      {allPositions.length > 0 && (
        <Button type="button" variant="outline" onClick={() => setShowAssign((v) => !v)}>
          Assign a position
        </Button>
      )}
      {showAssign && (
        <AssignPositionForm
          staff={staff}
          positions={allPositions}
          onDone={async () => {
            await load();
            await onChanged();
            setShowAssign(false);
          }}
        />
      )}
    </div>
  );
}

function assignmentStatusVariant(status: StaffAssignment['status']): 'default' | 'accent' | 'success' | 'muted' {
  if (status === 'active') return 'success';
  if (status === 'left') return 'muted';
  return 'accent';
}

function NewAssignmentForm({ staff, onDone }: { staff: Staff; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [role, setRole] = useState<StaffRole>('teacher');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<AssignmentEntryType>('transfer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson(`/api/v1/staff/${staff.userId}/assignments`, 'POST', {
      academicYearId,
      role,
      entryDate,
      entryType,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('New assignment started.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Academic year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} options={years.map((y) => ({ value: y.id, label: y.yearName }))} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} options={STAFF_ROLES.map((r) => ({ value: r, label: STAFF_ROLE_LABEL[r] }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Entry type" value={entryType} onChange={(e) => setEntryType(e.target.value as AssignmentEntryType)} options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABEL[t] }))} />
        <Input label="Entry date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
      </div>
      <Button type="submit" isLoading={saving}>
        Start assignment
      </Button>
    </form>
  );
}

function EndAssignmentForm({ assignment, onDone }: { assignment: StaffAssignment; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitType, setExitType] = useState<AssignmentExitType>('resignation');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson(
      `/api/v1/staff/${assignment.staffId}/assignments/${assignment.id}/end`,
      'POST',
      { exitDate, exitType },
    );
    setSaving(false);
    if (res.ok) {
      toast.success('Assignment closed.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Exit date" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} required />
        <Select label="Reason" value={exitType} onChange={(e) => setExitType(e.target.value as AssignmentExitType)} options={EXIT_TYPES.map((t) => ({ value: t, label: EXIT_TYPE_LABEL[t] }))} />
      </div>
      <Button type="submit" isLoading={saving} variant="outline">
        Close this assignment
      </Button>
    </form>
  );
}

function SpecializationsPanel({ staff, onChanged }: { staff: Staff; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [adding, setAdding] = useState('');

  useEffect(() => {
    void (async () => {
      const schoolCurricula = await fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula');
      const curriculumId = schoolCurricula[0]?.curriculumId;
      if (curriculumId) {
        setSubjects(await fetchList<CatalogSubject>(`/api/v1/academic/subjects?curriculumId=${curriculumId}`));
      }
    })();
  }, []);

  const specializedIds = new Set(staff.specializations.map((s: StaffSpecialization) => s.subjectId));
  const available = subjects.filter((s) => !specializedIds.has(s.id));

  async function add() {
    if (!adding) return;
    const res = await submitJson(`/api/v1/staff/${staff.userId}/specializations`, 'POST', { subjectId: adding });
    if (res.ok) {
      setAdding('');
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  async function remove(subjectId: string) {
    const res = await submitJson(`/api/v1/staff/${staff.userId}/specializations/${subjectId}`, 'DELETE');
    if (res.ok) await onChanged();
    else toast.error(res.error!);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {staff.specializations.length === 0 && <span className="text-sm text-text-faint">None on file.</span>}
        {staff.specializations.map((s) => (
          <span key={s.subjectId} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2.5 py-1 text-xs">
            {s.subjectName}
            <button type="button" onClick={() => void remove(s.subjectId)} className="text-text-faint hover:text-red-600">
              <Trash2 className="w-3 h-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select
              label="Add a specialization"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              options={[{ value: '', label: 'Select a subject…' }, ...available.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void add()} disabled={!adding}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

export function StaffDetailModal({
  open,
  onClose,
  onChanged,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  staff: Staff;
}) {
  const [history, setHistory] = useState<StaffAssignment[] | null>(null);
  const [teachingLoad, setTeachingLoad] = useState<SubjectTeacherAssignment[] | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [showNewAssignment, setShowNewAssignment] = useState(false);

  const load = async () => {
    setHistory(await fetchList<StaffAssignment>(`/api/v1/staff/${staff.userId}/assignments`));
    setTeachingLoad(await fetchList<SubjectTeacherAssignment>(`/api/v1/staff/${staff.userId}/teaching-load`));
  };

  useEffect(() => {
    void (async () => {
      await load();
      setShowEnd(false);
      setShowNewAssignment(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.userId]);

  const refresh = async () => {
    await load();
    await onChanged();
    setShowEnd(false);
    setShowNewAssignment(false);
  };

  const activeLoad = teachingLoad?.filter((t) => t.status === 'active') ?? [];

  return (
    <Modal open={open} onClose={onClose} title={staffFullName(staff)} size="lg">
      <div className="space-y-6">
        <section>
          <PhotoEditor staff={staff} onChanged={onChanged} />
        </section>

        <section className="space-y-1 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div><span className="text-text-faint">Staff ID</span><div className="font-medium">{staff.systemId ?? '—'}</div></div>
            <div><span className="text-text-faint">Category</span><div className="font-medium">{STAFF_CATEGORY_LABEL[staff.category]}</div></div>
            <div><span className="text-text-faint">TMIS</span><div className="font-medium">{staff.tmisNumber ?? `— (${TMIS_STATUS_LABEL[staff.tmisStatus]})`}</div></div>
            <div><span className="text-text-faint">Employment</span><div className="font-medium">{EMPLOYMENT_TYPE_LABEL[staff.employmentType]}{staff.employmentBasis ? ` · ${EMPLOYMENT_BASIS_LABEL[staff.employmentBasis]}` : ''}</div></div>
            <div><span className="text-text-faint">Qualification</span><div className="font-medium">{staff.qualification ?? '—'}</div></div>
            <div><span className="text-text-faint">Email</span><div className="font-medium">{staff.email ?? '—'}</div></div>
            <div><span className="text-text-faint">Phone</span><div className="font-medium">{staff.phoneNumber ?? '—'}</div></div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">School assignment</h3>
          {staff.activeAssignment ? (
            <div className="rounded-xl border border-border p-3 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">{STAFF_ROLE_LABEL[staff.activeAssignment.role]}</div>
                <div className="text-text-faint">{staff.activeAssignment.academicYearName} · since {new Date(staff.activeAssignment.entryDate).toLocaleDateString()}</div>
              </div>
              <Button type="button" variant="outline" inline onClick={() => setShowEnd((v) => !v)}>
                End assignment
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm text-text-muted flex items-center justify-between">
              <span>Not currently assigned at this school.</span>
              <Button type="button" inline onClick={() => setShowNewAssignment((v) => !v)}>
                Start assignment
              </Button>
            </div>
          )}
          {showEnd && staff.activeAssignment && (
            <div className="mt-2">
              <EndAssignmentForm assignment={staff.activeAssignment} onDone={refresh} />
            </div>
          )}
          {showNewAssignment && !staff.activeAssignment && (
            <div className="mt-2">
              <NewAssignmentForm staff={staff} onDone={refresh} />
            </div>
          )}

          {history && history.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <h4 className="text-xs font-medium text-text-faint">History</h4>
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs text-text-muted border-t border-border pt-1.5">
                  <span>{STAFF_ROLE_LABEL[h.role]} — {h.academicYearName}</span>
                  <span className="flex items-center gap-2">
                    <span>{new Date(h.entryDate).toLocaleDateString()}{h.exitDate ? ` → ${new Date(h.exitDate).toLocaleDateString()}` : ''}</span>
                    <Badge variant={assignmentStatusVariant(h.status)}>{h.status.replace('_', ' ')}</Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">Teaching load</h3>
          {teachingLoad === null ? (
            <p className="text-sm text-text-faint">Loading…</p>
          ) : activeLoad.length === 0 ? (
            <p className="text-sm text-text-faint">Not currently assigned to teach any subject.</p>
          ) : (
            <div className="space-y-1.5">
              {activeLoad.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm border-t border-border pt-1.5 first:border-0 first:pt-0">
                  <span>
                    {t.subjectName} — {t.className}
                    {t.streamName ? ` · ${t.streamName}` : ''}
                  </span>
                  {!t.isLead && <Badge variant="muted">Co-teacher</Badge>}
                </div>
              ))}
            </div>
          )}
        </section>

        {staff.category === 'teaching' && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">Specializations</h3>
            <SpecializationsPanel staff={staff} onChanged={refresh} />
          </section>
        )}

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            Department &amp; position
          </h3>
          <PositionsPanel staff={staff} onChanged={onChanged} />
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            Academic documents
          </h3>
          <DocumentsPanel staffId={staff.userId} />
        </section>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
