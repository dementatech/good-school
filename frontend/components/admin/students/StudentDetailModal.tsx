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
import {
  ENTRY_TYPE_LABEL,
  ENTRY_TYPES,
  EXIT_TYPE_LABEL,
  EXIT_TYPES,
  GUARDIAN_ROLES,
  LIN_STATUS_LABEL,
  studentFullName,
  type AcademicYear,
  type EnrollmentRecord,
  type EntryType,
  type ExitType,
  type GuardianRole,
  type SchoolClass,
  type Stream,
  type Student,
  type StudentGuardian,
} from './types';
import { StudentAvatar } from './StudentAvatar';
import { StudentSubjectsPanel } from './StudentSubjectsPanel';
import { PriorExamsSection } from './PriorExamsSection';

function PhotoEditor({ student, onChanged }: { student: Student; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  // Local override so the avatar updates the moment an upload succeeds,
  // rather than waiting on the parent list's refetch to flow a new `student`
  // prop back down here (the modal doesn't get closed/reopened just for this).
  const [photoUrl, setPhotoUrl] = useState(student.photoUrl);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/v1/students/${student.userId}/photo`, {
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
    const res = await submitJson<Student>(`/api/v1/students/${student.userId}/photo`, 'DELETE');
    if (res.ok) {
      setPhotoUrl(null);
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <StudentAvatar photoUrl={photoUrl} name={studentFullName(student)} size="lg" />
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

interface GuardianSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  relationshipToStudent: string | null;
}

function AddGuardianForm({ student, onDone }: { student: Student; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GuardianSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<GuardianSearchResult | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationshipToStudent, setRelationshipToStudent] = useState('');
  const [role, setRole] = useState<GuardianRole>('parent');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);
  const [isFeeResponsible, setIsFeeResponsible] = useState(false);
  const [isEmergencyContact, setIsEmergencyContact] = useState(false);
  const [saving, setSaving] = useState(false);

  // Debounced search against existing guardians — reusing a sibling's
  // already-on-file guardian instead of creating a duplicate `guardian` row.
  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        const q = query.trim();
        if (q.length < 2) {
          setResults([]);
          return;
        }
        setSearching(true);
        const list = await fetchList<GuardianSearchResult>(
          `/api/v1/students/guardians/search?search=${encodeURIComponent(q)}`,
          toast.error,
        );
        if (!controller.signal.aborted) setResults(list);
        setSearching(false);
      })();
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected && (!firstName.trim() || !lastName.trim())) {
      toast.error('Pick an existing guardian, or enter a first and last name.');
      return;
    }
    setSaving(true);
    const body = selected
      ? { guardianId: selected.id, role, isPrimaryContact, isFeeResponsible, isEmergencyContact }
      : {
          newGuardian: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            relationshipToStudent: relationshipToStudent.trim() || null,
          },
          role,
          isPrimaryContact,
          isFeeResponsible,
          isEmergencyContact,
        };
    const res = await submitJson(`/api/v1/students/${student.userId}/guardians`, 'POST', body);
    setSaving(false);
    if (res.ok) {
      toast.success('Guardian added.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      {!selected && (
        <div className="space-y-1.5">
          <Input
            label="Search existing guardians (optional)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or phone — reuses a sibling's guardian instead of duplicating"
          />
          {searching && <p className="text-xs text-text-faint">Searching…</p>}
          {results.length > 0 && (
            <div className="space-y-1">
              {results.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => {
                    setSelected(g);
                    setResults([]);
                    setQuery(`${g.firstName} ${g.lastName}`);
                  }}
                  className="block w-full text-left text-sm rounded-lg border border-border px-2 py-1.5 hover:bg-bg-muted"
                >
                  <span className="font-medium">
                    {g.firstName} {g.lastName}
                  </span>
                  <span className="text-text-faint">
                    {g.phone ? ` · ${g.phone}` : ''}
                    {g.email ? ` · ${g.email}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selected ? (
        <div className="flex items-center justify-between rounded-lg bg-bg-muted px-2 py-1.5 text-sm">
          <span>
            <span className="font-medium">
              {selected.firstName} {selected.lastName}
            </span>{' '}
            — existing guardian
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery('');
            }}
            className="text-text-faint hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input label="Last name *" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Relationship to student"
            value={relationshipToStudent}
            onChange={(e) => setRelationshipToStudent(e.target.value)}
            placeholder="Mother, Father, Aunt…"
          />
        </div>
      )}
      <Select
        label="Role"
        value={role}
        onChange={(e) => setRole(e.target.value as GuardianRole)}
        options={GUARDIAN_ROLES.map((r) => ({ value: r, label: r }))}
      />
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={isPrimaryContact}
            onChange={(e) => setIsPrimaryContact(e.target.checked)}
            className="rounded border-[#E5E5E5]"
          />
          Primary contact
        </label>
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={isFeeResponsible}
            onChange={(e) => setIsFeeResponsible(e.target.checked)}
            className="rounded border-[#E5E5E5]"
          />
          Fee responsible
        </label>
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={isEmergencyContact}
            onChange={(e) => setIsEmergencyContact(e.target.checked)}
            className="rounded border-[#E5E5E5]"
          />
          Emergency contact
        </label>
      </div>
      <Button type="submit" isLoading={saving} inline>
        Add guardian
      </Button>
    </form>
  );
}

function statusVariant(status: EnrollmentRecord['status']): 'default' | 'accent' | 'success' | 'muted' {
  if (status === 'active') return 'success';
  if (status === 'withdrawn' || status === 'no_show') return 'muted';
  return 'accent';
}

function NewEnrollmentForm({ student, onDone }: { student: Student; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<EntryType>('repeat');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years', toast.error);
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    void fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${academicYearId}`, toast.error).then(setClasses);
  }, [academicYearId]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!classId || !selectedClass?.hasStreams) return;
    void fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`, toast.error).then(setStreams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) {
      toast.error('Pick a class.');
      return;
    }
    setSaving(true);
    const res = await submitJson(`/api/v1/students/${student.userId}/enrollments`, 'POST', {
      academicYearId,
      classId,
      streamId: streamId || null,
      entryDate,
      entryType,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('New enrollment period started.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Academic year" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} options={years.map((y) => ({ value: y.id, label: y.yearName }))} />
        <Select label="Entry type" value={entryType} onChange={(e) => setEntryType(e.target.value as EntryType)} options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABEL[t] }))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          options={[{ value: '', label: 'Select a class…' }, ...classes.map((c) => ({ value: c.id, label: c.stageName }))]}
        />
        {selectedClass?.hasStreams && (
          <Select
            label="Stream"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            options={[{ value: '', label: 'Select a stream…' }, ...streams.map((s) => ({ value: s.id, label: s.name }))]}
          />
        )}
      </div>
      <Input label="Entry date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
      <Button type="submit" isLoading={saving}>
        Start enrollment
      </Button>
    </form>
  );
}

function WithdrawForm({ enrollment, onDone }: { enrollment: EnrollmentRecord; onDone: () => Promise<void> | void }) {
  const toast = useToast();
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitType, setExitType] = useState<ExitType>('withdrawal');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await submitJson(
      `/api/v1/students/${enrollment.studentUserId}/enrollments/${enrollment.id}/withdraw`,
      'POST',
      { exitDate, exitType },
    );
    setSaving(false);
    if (res.ok) {
      toast.success('Enrollment closed.');
      await onDone();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Exit date" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} required />
        <Select label="Reason" value={exitType} onChange={(e) => setExitType(e.target.value as ExitType)} options={EXIT_TYPES.map((t) => ({ value: t, label: EXIT_TYPE_LABEL[t] }))} />
      </div>
      <Button type="submit" isLoading={saving} variant="outline">
        Close this enrollment
      </Button>
    </form>
  );
}

export function StudentDetailModal({
  open,
  onClose,
  onChanged,
  student,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  student: Student;
}) {
  const toast = useToast();
  const [guardians, setGuardians] = useState<StudentGuardian[] | null>(null);
  const [history, setHistory] = useState<EnrollmentRecord[] | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showNewEnrollment, setShowNewEnrollment] = useState(false);
  const [showAddGuardian, setShowAddGuardian] = useState(false);

  const load = async () => {
    setGuardians(await fetchList<StudentGuardian>(`/api/v1/students/${student.userId}/guardians`, toast.error));
    setHistory(await fetchList<EnrollmentRecord>(`/api/v1/students/${student.userId}/enrollments`, toast.error));
  };

  // No synchronous setState at the top of this effect (react-hooks/set-state-in-effect)
  // — everything, including the toggle reset, happens inside the async callback.
  useEffect(() => {
    void (async () => {
      await load();
      setShowWithdraw(false);
      setShowNewEnrollment(false);
      setShowAddGuardian(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.userId]);

  const refresh = async () => {
    await load();
    await onChanged();
    setShowWithdraw(false);
    setShowNewEnrollment(false);
    setShowAddGuardian(false);
  };

  async function removeGuardian(guardianId: string) {
    const res = await submitJson(`/api/v1/students/${student.userId}/guardians/${guardianId}`, 'DELETE');
    if (res.ok) {
      toast.success('Guardian removed.');
      await refresh();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={studentFullName(student)} size="lg">
      <div className="space-y-6">
        <section>
          <PhotoEditor student={student} onChanged={onChanged} />
        </section>

        <section className="space-y-1 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div><span className="text-text-faint">Student ID</span><div className="font-medium">{student.systemId ?? '—'}</div></div>
            <div><span className="text-text-faint">LIN</span><div className="font-medium">{student.lin ?? `— (${LIN_STATUS_LABEL[student.linStatus]})`}</div></div>
            <div><span className="text-text-faint">Date of birth</span><div className="font-medium">{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '—'}</div></div>
            <div><span className="text-text-faint">Gender</span><div className="font-medium capitalize">{student.gender ?? '—'}</div></div>
            <div><span className="text-text-faint">Email</span><div className="font-medium">{student.email ?? '—'}</div></div>
            <div><span className="text-text-faint">Phone</span><div className="font-medium">{student.phoneNumber ?? '—'}</div></div>
            <div>
              <span className="text-text-faint">Payment code</span>
              <div className="font-medium">
                {student.paymentCode ?? <span className="text-error">Not set</span>}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">Enrollment</h3>
          {student.activeEnrollment ? (
            <div className="rounded-xl border border-border p-3 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">{student.activeEnrollment.stageName}{student.activeEnrollment.streamName ? ` · ${student.activeEnrollment.streamName}` : ''}</div>
                <div className="text-text-faint">{student.activeEnrollment.academicYearName} · since {new Date(student.activeEnrollment.entryDate).toLocaleDateString()}</div>
              </div>
              <Button type="button" variant="outline" inline onClick={() => setShowWithdraw((v) => !v)}>
                Withdraw / close
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm text-text-muted flex items-center justify-between">
              <span>Not enrolled in any class.</span>
              <Button type="button" inline onClick={() => setShowNewEnrollment((v) => !v)}>
                Assign a class
              </Button>
            </div>
          )}
          {showWithdraw && student.activeEnrollment && (
            <div className="mt-2">
              <WithdrawForm enrollment={student.activeEnrollment} onDone={refresh} />
            </div>
          )}
          {showNewEnrollment && !student.activeEnrollment && (
            <div className="mt-2">
              <NewEnrollmentForm student={student} onDone={refresh} />
            </div>
          )}

          {history && history.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <h4 className="text-xs font-medium text-text-faint">History</h4>
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs text-text-muted border-t border-border pt-1.5">
                  <span>{h.stageName}{h.streamName ? ` · ${h.streamName}` : ''} — {h.academicYearName}</span>
                  <span className="flex items-center gap-2">
                    <span>{new Date(h.entryDate).toLocaleDateString()}{h.exitDate ? ` → ${new Date(h.exitDate).toLocaleDateString()}` : ''}</span>
                    <Badge variant={statusVariant(h.status)}>{h.status.replace('_', ' ')}</Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <PriorExamsSection studentUserId={student.userId} />

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            {student.activeEnrollment?.stagePhase === 'A_LEVEL' ? 'Combination' : 'Subjects'}
          </h3>
          <StudentSubjectsPanel studentUserId={student.userId} enrollment={student.activeEnrollment} />
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint">Guardians</h3>
            <Button type="button" variant="outline" inline onClick={() => setShowAddGuardian((v) => !v)}>
              Add guardian
            </Button>
          </div>
          {showAddGuardian && (
            <div className="mb-3">
              <AddGuardianForm student={student} onDone={refresh} />
            </div>
          )}
          {guardians === null ? (
            <p className="text-sm text-text-faint">Loading…</p>
          ) : guardians.length === 0 ? (
            <p className="text-sm text-text-faint">No guardians on file.</p>
          ) : (
            <div className="space-y-2">
              {guardians.map((g) => (
                <div key={g.id} className="rounded-xl border border-border p-3 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{g.firstName} {g.lastName} <span className="text-text-faint font-normal capitalize">({g.role})</span></div>
                    <div className="text-text-faint">{g.phone ?? '—'}{g.email ? ` · ${g.email}` : ''}{g.relationshipToStudent ? ` · ${g.relationshipToStudent}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {g.isPrimaryContact && <Badge variant="default">Primary</Badge>}
                      {g.isFeeResponsible && <Badge variant="accent">Fees</Badge>}
                      {g.isEmergencyContact && <Badge variant="muted">Emergency</Badge>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeGuardian(g.id)}
                      className="text-text-faint hover:text-red-600"
                      aria-label={`Remove ${g.firstName} ${g.lastName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
