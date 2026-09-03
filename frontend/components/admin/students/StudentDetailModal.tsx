'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import {
  ENTRY_TYPE_LABEL,
  ENTRY_TYPES,
  EXIT_TYPE_LABEL,
  EXIT_TYPES,
  LIN_STATUS_LABEL,
  studentFullName,
  type AcademicYear,
  type EnrollmentRecord,
  type EntryType,
  type ExitType,
  type SchoolClass,
  type Stream,
  type Student,
  type StudentGuardian,
} from './types';
import { StudentSubjectsPanel } from './StudentSubjectsPanel';

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
      const list = await fetchList<AcademicYear>('/api/v1/academic/years');
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      if (current) setAcademicYearId(current.id);
    })();
  }, []);

  useEffect(() => {
    if (!academicYearId) return;
    void fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${academicYearId}`).then(setClasses);
  }, [academicYearId]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!classId || !selectedClass?.hasStreams) return;
    void fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`).then(setStreams);
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
  const [guardians, setGuardians] = useState<StudentGuardian[] | null>(null);
  const [history, setHistory] = useState<EnrollmentRecord[] | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showNewEnrollment, setShowNewEnrollment] = useState(false);

  const load = async () => {
    setGuardians(await fetchList<StudentGuardian>(`/api/v1/students/${student.userId}/guardians`));
    setHistory(await fetchList<EnrollmentRecord>(`/api/v1/students/${student.userId}/enrollments`));
  };

  // No synchronous setState at the top of this effect (react-hooks/set-state-in-effect)
  // — everything, including the toggle reset, happens inside the async callback.
  useEffect(() => {
    void (async () => {
      await load();
      setShowWithdraw(false);
      setShowNewEnrollment(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.userId]);

  const refresh = async () => {
    await load();
    await onChanged();
    setShowWithdraw(false);
    setShowNewEnrollment(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={studentFullName(student)} size="lg">
      <div className="space-y-6">
        <section className="space-y-1 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div><span className="text-text-faint">Student ID</span><div className="font-medium">{student.systemId ?? '—'}</div></div>
            <div><span className="text-text-faint">LIN</span><div className="font-medium">{student.lin ?? `— (${LIN_STATUS_LABEL[student.linStatus]})`}</div></div>
            <div><span className="text-text-faint">Date of birth</span><div className="font-medium">{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : '—'}</div></div>
            <div><span className="text-text-faint">Gender</span><div className="font-medium capitalize">{student.gender ?? '—'}</div></div>
            <div><span className="text-text-faint">Email</span><div className="font-medium">{student.email ?? '—'}</div></div>
            <div><span className="text-text-faint">Phone</span><div className="font-medium">{student.phoneNumber ?? '—'}</div></div>
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

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            {student.activeEnrollment?.stagePhase === 'A_LEVEL' ? 'Combination' : 'Subjects'}
          </h3>
          <StudentSubjectsPanel studentUserId={student.userId} enrollment={student.activeEnrollment} />
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">Guardians</h3>
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
                  <div className="flex gap-1">
                    {g.isPrimaryContact && <Badge variant="default">Primary</Badge>}
                    {g.isFeeResponsible && <Badge variant="accent">Fees</Badge>}
                    {g.isEmergencyContact && <Badge variant="muted">Emergency</Badge>}
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
