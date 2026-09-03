'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Plus, Trash2 } from 'lucide-react';
import {
  ENTRY_TYPES,
  ENTRY_TYPE_LABEL,
  GENDERS,
  GUARDIAN_ROLES,
  LIN_STATUSES,
  LIN_STATUS_LABEL,
  type AcademicYear,
  type EntryType,
  type Gender,
  type GuardianRole,
  type LinStatus,
  type SchoolClass,
  type Stream,
  type Student,
} from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

interface GuardianRow {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  relationshipToStudent: string;
  role: GuardianRole;
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

function emptyGuardian(first = false): GuardianRow {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    relationshipToStudent: '',
    role: 'parent',
    isPrimaryContact: first,
    isFeeResponsible: first,
    isEmergencyContact: first,
  };
}

type IdentityState = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | '';
  lin: string;
  linStatus: LinStatus;
  email: string;
  phoneNumber: string;
};

function initialIdentity(s?: Student): IdentityState {
  return {
    firstName: s?.firstName ?? '',
    middleName: s?.middleName ?? '',
    lastName: s?.lastName ?? '',
    dateOfBirth: s?.dateOfBirth ?? '',
    gender: s?.gender ?? '',
    lin: s?.lin ?? '',
    linStatus: s?.linStatus ?? 'not_yet_issued',
    email: s?.email ?? '',
    phoneNumber: s?.phoneNumber ?? '',
  };
}

export function StudentFormModal({
  open,
  onClose,
  onSaved,
  student,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Omit to create a new student; pass to edit identity fields only
   * (enrollment/guardians are managed elsewhere once a student exists — see
   * docs/design/parent-guardian-module.md, deferred beyond initial intake). */
  student?: Student;
}) {
  const toast = useToast();
  const isEdit = Boolean(student);
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity(student));
  const set = <K extends keyof IdentityState>(k: K, v: IdentityState[K]) =>
    setIdentity((f) => ({ ...f, [k]: v }));

  // Enrollment — only asked at creation time. A student without a class
  // isn't meaningfully enrolled (docs/design/student-data-model.md §3).
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<EntryType>('new_admission');

  const [guardians, setGuardians] = useState<GuardianRow[]>(() => [emptyGuardian(true)]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) return;
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, [isEdit]);

  useEffect(() => {
    // No synchronous reset here (react-hooks/set-state-in-effect) — an empty
    // academicYearId just leaves the prior class list stale until a year is
    // picked, same tradeoff as MyLibraryUploads.tsx.
    if (!academicYearId) return;
    fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${academicYearId}`).then((list) => {
      setClasses(list);
      setClassId('');
    });
  }, [academicYearId]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!classId || !selectedClass?.hasStreams) return;
    void (async () => {
      setStreams(await fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`));
      setStreamId('');
    })();
    // selectedClass is derived from classes/classId — only classId should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  function updateGuardian(i: number, patch: Partial<GuardianRow>) {
    setGuardians((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trim = (v: string) => v.trim() || null;

    if (isEdit) {
      setSaving(true);
      const res = await submitJson(`/api/v1/students/${student!.userId}`, 'PATCH', {
        firstName: identity.firstName.trim(),
        middleName: trim(identity.middleName),
        lastName: identity.lastName.trim(),
        dateOfBirth: trim(identity.dateOfBirth),
        gender: identity.gender || null,
        lin: trim(identity.lin),
        linStatus: identity.linStatus,
        email: trim(identity.email),
        phoneNumber: trim(identity.phoneNumber),
      });
      setSaving(false);
      if (res.ok) {
        toast.success('Student updated.');
        await onSaved();
        onClose();
      } else {
        toast.error(res.error!);
      }
      return;
    }

    if (!classId) {
      toast.error('Pick a class — a student needs a class to be enrolled.');
      return;
    }
    if (selectedClass?.hasStreams && !streamId) {
      toast.error('This class has streams — pick one.');
      return;
    }
    const validGuardians = guardians.filter((g) => g.firstName.trim() && g.lastName.trim());
    if (validGuardians.length === 0) {
      toast.error('Add at least one guardian.');
      return;
    }

    setSaving(true);
    const res = await submitJson<{
      student: Student;
      tempPassword: string;
      guardians: { firstName: string; lastName: string; matchedExisting: boolean }[];
    }>('/api/v1/students', 'POST', {
      firstName: identity.firstName.trim(),
      middleName: trim(identity.middleName),
      lastName: identity.lastName.trim(),
      dateOfBirth: trim(identity.dateOfBirth),
      gender: identity.gender || null,
      lin: trim(identity.lin),
      linStatus: identity.linStatus,
      email: trim(identity.email),
      phoneNumber: trim(identity.phoneNumber),
      enrollment: {
        academicYearId,
        classId,
        streamId: streamId || null,
        entryDate,
        entryType,
      },
      guardians: validGuardians.map((g) => ({
        newGuardian: {
          firstName: g.firstName.trim(),
          lastName: g.lastName.trim(),
          phone: trim(g.phone),
          email: trim(g.email),
          relationshipToStudent: trim(g.relationshipToStudent),
        },
        role: g.role,
        isPrimaryContact: g.isPrimaryContact,
        isFeeResponsible: g.isFeeResponsible,
        isEmergencyContact: g.isEmergencyContact,
      })),
    });
    setSaving(false);
    if (res.ok && res.data) {
      const matched = res.data.guardians.filter((g) => g.matchedExisting);
      const created = res.data.guardians.filter((g) => !g.matchedExisting);
      const parts: string[] = [];
      if (created.length) parts.push(`${created.length} new guardian${created.length > 1 ? 's' : ''} created`);
      if (matched.length) {
        parts.push(`linked to existing guardian${matched.length > 1 ? 's' : ''} (${matched.map((g) => `${g.firstName} ${g.lastName}`).join(', ')})`);
      }
      toast.success(`Student enrolled — temp password: ${res.data.tempPassword}. ${parts.join('; ')}.`);
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${student!.firstName}` : 'Enrol a student'} size="lg">
      <form onSubmit={submit} className="space-y-6">
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="First name" value={identity.firstName} onChange={(e) => set('firstName', e.target.value)} required />
            <Input label="Middle name" value={identity.middleName} onChange={(e) => set('middleName', e.target.value)} />
            <Input label="Last name" value={identity.lastName} onChange={(e) => set('lastName', e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Date of birth" type="date" value={identity.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
            <Select
              label="Gender"
              value={identity.gender}
              onChange={(e) => set('gender', e.target.value as Gender | '')}
              options={[{ value: '', label: '—' }, ...GENDERS.map((g) => ({ value: g, label: g }))]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="LIN (Learner Identification Number)"
              value={identity.lin}
              onChange={(e) => set('lin', e.target.value)}
              placeholder="Leave blank if not yet issued"
            />
            <Select
              label="LIN status"
              value={identity.linStatus}
              onChange={(e) => set('linStatus', e.target.value as LinStatus)}
              options={LIN_STATUSES.map((s) => ({ value: s, label: LIN_STATUS_LABEL[s] }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Student email (optional)" type="email" value={identity.email} onChange={(e) => set('email', e.target.value)} />
            <Input label="Student phone (optional)" value={identity.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)} />
          </div>
        </Section>

        {!isEdit && (
          <>
            <Section title="Enrollment">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Academic year"
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                  options={years.map((y) => ({ value: y.id, label: y.yearName }))}
                />
                <Select
                  label="Entry type"
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as EntryType)}
                  options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABEL[t] }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Class"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  options={[
                    { value: '', label: classes.length ? 'Select a class…' : 'No classes set up for this year yet' },
                    ...classes.map((c) => ({ value: c.id, label: c.stageName })),
                  ]}
                />
                {selectedClass?.hasStreams && (
                  <Select
                    label="Stream"
                    value={streamId}
                    onChange={(e) => setStreamId(e.target.value)}
                    options={[
                      { value: '', label: streams.length ? 'Select a stream…' : 'No streams set up for this class yet' },
                      ...streams.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                )}
              </div>
              <Input label="Entry date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            </Section>

            <Section title="Guardians">
              <div className="space-y-4">
                {guardians.map((g, i) => (
                  <div key={i} className="rounded-xl border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-text-muted">Guardian {i + 1}</span>
                      {guardians.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setGuardians((rows) => rows.filter((_, idx) => idx !== i))}
                          className="text-text-faint hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="First name" value={g.firstName} onChange={(e) => updateGuardian(i, { firstName: e.target.value })} required />
                      <Input label="Last name" value={g.lastName} onChange={(e) => updateGuardian(i, { lastName: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Phone"
                        value={g.phone}
                        onChange={(e) => updateGuardian(i, { phone: e.target.value })}
                        placeholder="A matching phone reuses an existing guardian"
                      />
                      <Input label="Email (optional)" type="email" value={g.email} onChange={(e) => updateGuardian(i, { email: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Relationship to student"
                        value={g.relationshipToStudent}
                        onChange={(e) => updateGuardian(i, { relationshipToStudent: e.target.value })}
                        placeholder="Mother, Father, Aunt…"
                      />
                      <Select
                        label="Role"
                        value={g.role}
                        onChange={(e) => updateGuardian(i, { role: e.target.value as GuardianRole })}
                        options={GUARDIAN_ROLES.map((r) => ({ value: r, label: r }))}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-[#12333F]">
                        <input type="checkbox" checked={g.isPrimaryContact} onChange={(e) => updateGuardian(i, { isPrimaryContact: e.target.checked })} className="rounded border-[#E5E5E5]" />
                        Primary contact
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#12333F]">
                        <input type="checkbox" checked={g.isFeeResponsible} onChange={(e) => updateGuardian(i, { isFeeResponsible: e.target.checked })} className="rounded border-[#E5E5E5]" />
                        Fee responsible
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#12333F]">
                        <input type="checkbox" checked={g.isEmergencyContact} onChange={(e) => updateGuardian(i, { isEmergencyContact: e.target.checked })} className="rounded border-[#E5E5E5]" />
                        Emergency contact
                      </label>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => setGuardians((rows) => [...rows, emptyGuardian()])}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                  Add another guardian
                </Button>
              </div>
            </Section>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {isEdit ? 'Save changes' : 'Enrol student'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
