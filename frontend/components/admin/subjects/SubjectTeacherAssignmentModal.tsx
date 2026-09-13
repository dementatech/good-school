'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import type { SchoolClass, Stream } from '@/components/admin/students/types';
import type { StaffCandidate, Staff, SubjectTeacherAssignment } from '@/components/admin/staff/types';
import type { CatalogSubject, SubjectPhase } from '@/components/admin/subjects/types';

const PHASE_LABEL: Record<SubjectPhase, string> = { O_LEVEL: 'O-Level', A_LEVEL: 'A-Level' };

// The allocation half of docs/design/teachers-module.md §4 — "who teaches
// this" lives right next to "is this subject offered", the same screen, not
// a separate forgettable step.

export function SubjectTeacherAssignmentModal({
  open,
  onClose,
  onChanged,
  academicYearId,
  subjectId,
  subjectName,
  subjectPhase,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  academicYearId: string;
  subjectId: string;
  subjectName: string;
  subjectPhase: SubjectPhase;
}) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<SubjectTeacherAssignment[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [candidates, setCandidates] = useState<StaffCandidate[]>([]);
  const [allActiveStaff, setAllActiveStaff] = useState<Staff[]>([]);
  const [phaseSubjects, setPhaseSubjects] = useState<CatalogSubject[]>([]);

  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setAssignments(
      await fetchList<SubjectTeacherAssignment>(
        `/api/v1/subject-teacher-assignments?academicYearId=${academicYearId}&subjectId=${subjectId}`,
      ),
    );
  };

  useEffect(() => {
    void (async () => {
      await load();
      setClasses(await fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${academicYearId}`));
      setCandidates(await fetchList<StaffCandidate>(`/api/v1/staff/candidates?subjectId=${subjectId}`));
      setAllActiveStaff((await fetchList<Staff>('/api/v1/staff')).filter((s) => s.activeAssignment));
      // Subject rows are single-phase (a school's O-Level and A-Level version
      // of "Mathematics" are different subject ids) — this is how we tell
      // whether a staff member's specialization is for THIS phase at all.
      setPhaseSubjects(await fetchList<CatalogSubject>(`/api/v1/academic/subjects?phase=${subjectPhase}`));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, academicYearId, subjectPhase]);

  // Only classes this subject's phase actually runs at — an O-Level subject
  // has no business being assigned against an S5/S6 (A-Level) class.
  const phaseClasses = classes.filter((c) => c.stagePhase === subjectPhase);
  const selectedClass = phaseClasses.find((c) => c.id === classId) ?? null;

  // No synchronous reset here (react-hooks/set-state-in-effect) — a class
  // with no streams just leaves the prior stream list stale until a
  // stream-having class is picked, same tradeoff as StudentFormModal.tsx.
  useEffect(() => {
    if (!classId || !selectedClass?.hasStreams) return;
    void (async () => {
      setStreams(await fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`));
      setStreamId('');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Specialized-and-active candidates first (teachers-module.md §4.2); any
  // other active staff member who teaches *something* at this same phase
  // stays pickable underneath rather than blocking — a genuinely new subject
  // with no specialist yet shouldn't be a dead end. Staff who only teach the
  // other phase, or who aren't teaching staff at all, are left out entirely:
  // an O-Level assignment has no business listing an A-Level-only teacher.
  const candidateIds = new Set(candidates.map((c) => c.staffId));
  const phaseSubjectIds = new Set(phaseSubjects.map((s) => s.id));
  const fallbackStaff = allActiveStaff.filter(
    (s) =>
      !candidateIds.has(s.userId) &&
      s.category === 'teaching' &&
      s.specializations.some((sp) => phaseSubjectIds.has(sp.subjectId)),
  );

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !staffId) {
      toast.error('Pick a class and a teacher.');
      return;
    }
    setSaving(true);
    const res = await submitJson('/api/v1/subject-teacher-assignments', 'POST', {
      subjectId,
      academicYearId,
      classId,
      streamId: streamId || null,
      staffId,
      startDate,
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Teacher assigned.');
      setStaffId('');
      await load();
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  async function endAssignment(id: string) {
    const endDate = new Date().toISOString().slice(0, 10);
    const res = await submitJson(`/api/v1/subject-teacher-assignments/${id}/end`, 'POST', { endDate });
    if (res.ok) {
      toast.success('Assignment ended.');
      await load();
      await onChanged();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Who teaches ${subjectName}?`} size="lg">
      <div className="space-y-6">
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            Currently assigned
          </h3>
          {assignments === null ? (
            <p className="text-sm text-text-faint">Loading…</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-text-muted italic">
              Offered here, but nobody&rsquo;s assigned to teach it yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-t border-border pt-1.5 first:border-0 first:pt-0">
                  <span>
                    <span className="font-medium">{a.staffName}</span> — {a.className}
                    {a.streamName ? ` · ${a.streamName}` : ''}
                    {!a.isLead && <Badge variant="muted">Co-teacher</Badge>}
                  </span>
                  <Button type="button" variant="outline" inline onClick={() => void endAssignment(a.id)}>
                    End
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-faint mb-2">
            Assign a teacher
          </h3>
          <form onSubmit={assign} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                options={[
                  {
                    value: '',
                    label: phaseClasses.length
                      ? 'Select a class…'
                      : `No ${PHASE_LABEL[subjectPhase]} classes set up for this year yet`,
                  },
                  ...phaseClasses.map((c) => ({ value: c.id, label: c.stageName })),
                ]}
              />
              {selectedClass?.hasStreams && (
                <Select
                  label="Stream"
                  value={streamId}
                  onChange={(e) => setStreamId(e.target.value)}
                  options={[
                    { value: '', label: 'Whole class level (no stream split)' },
                    ...streams.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Teacher"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                options={[
                  { value: '', label: 'Select a teacher…' },
                  // Specialized-in-this-subject candidates surface first,
                  // starred, ahead of other same-phase teaching staff.
                  ...candidates.map((c) => ({
                    value: c.staffId,
                    label: `★ ${c.staffName} (${c.staffSystemId ?? '—'})`,
                  })),
                  ...fallbackStaff.map((s) => ({
                    value: s.userId,
                    label: `${s.firstName} ${s.lastName} (${s.systemId ?? '—'})`,
                  })),
                ]}
              />
              <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            {candidates.length === 0 && fallbackStaff.length > 0 && (
              <p className="text-xs text-text-faint">
                No staff specialize in {subjectName} yet — pick from another {PHASE_LABEL[subjectPhase]} teacher
                instead, or leave this offered-but-unassigned for now.
              </p>
            )}
            {candidates.length === 0 && fallbackStaff.length === 0 && (
              <p className="text-xs text-text-faint">
                Nobody at this school teaches {PHASE_LABEL[subjectPhase]} yet — leave this
                offered-but-unassigned for now.
              </p>
            )}
            <Button type="submit" isLoading={saving}>
              Assign
            </Button>
          </form>
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
