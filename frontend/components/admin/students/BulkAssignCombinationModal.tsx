'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { CombinationPicker, emptyCombinationChoice, type CombinationChoice } from './StudentSubjectsPanel';
import { studentFullName, type Student } from './types';

// Mirrors BulkAssignOutcome in backend/src/modules/students/domain/student-combinations.repository.ts
type Outcome =
  | { studentUserId: string; status: 'assigned'; warnings: string[] }
  | { studentUserId: string; status: 'skipped' | 'error'; message: string };

const classLabel = (s: Student) =>
  `${s.activeEnrollment?.stageName ?? ''}${s.activeEnrollment?.streamName ? ` · ${s.activeEnrollment.streamName}` : ''}`;

// Puts one combination on many unassigned A-Level students at once. The
// server runs each student through the normal single-assignment path (UNEB
// subsidiary rule, General Paper, subject sync), so results come back per
// student rather than all-or-nothing.
export function BulkAssignCombinationModal({
  students,
  onClose,
  onDone,
}: {
  /** Active A-Level students with no combination yet. */
  students: Student[];
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();

  // A combination belongs to one academic year, so the batch does too.
  const years = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of students) {
      if (s.activeEnrollment) byId.set(s.activeEnrollment.academicYearId, s.activeEnrollment.academicYearName);
    }
    return [...byId].map(([id, name]) => ({ id, name }));
  }, [students]);
  const [yearId, setYearId] = useState(years[0]?.id ?? '');
  const [classFilter, setClassFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState<CombinationChoice>(emptyCombinationChoice);
  const [saving, setSaving] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const inYear = students.filter((s) => s.activeEnrollment?.academicYearId === yearId);
  const classes = [...new Set(inYear.map(classLabel))].sort();
  const shown = inYear.filter((s) => !classFilter || classLabel(s) === classFilter);
  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(s.userId));
  const nameById = Object.fromEntries(students.map((s) => [s.userId, studentFullName(s)]));

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllShown() {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const s of shown) {
        if (allShownSelected) next.delete(s.userId);
        else next.add(s.userId);
      }
      return next;
    });
  }

  async function submit() {
    const ids = inYear.filter((s) => selected.has(s.userId)).map((s) => s.userId);
    if (!choice.schoolCombinationId) {
      toast.error('Pick a combination.');
      return;
    }
    if (ids.length === 0) {
      toast.error('Select at least one student.');
      return;
    }
    setSaving(true);
    const res = await submitJson<Outcome[]>('/api/v1/students/combinations/bulk', 'POST', {
      academicYearId: yearId,
      schoolCombinationId: choice.schoolCombinationId,
      subsidiarySubjectId: choice.subsidiarySubjectId,
      studentUserIds: ids,
    });
    setSaving(false);
    if (!res.ok || !res.data) {
      toast.error(res.error!);
      return;
    }
    const assigned = res.data.filter((o) => o.status === 'assigned').length;
    if (assigned > 0) toast.success(`Combination assigned to ${assigned} student${assigned === 1 ? '' : 's'}.`);
    setOutcomes(res.data);
    await onDone();
  }

  if (outcomes) {
    const problems = outcomes.filter((o): o is Extract<Outcome, { message: string }> => o.status !== 'assigned');
    const warned = outcomes.filter(
      (o): o is Extract<Outcome, { status: 'assigned' }> => o.status === 'assigned' && o.warnings.length > 0,
    );
    return (
      <Modal open onClose={onClose} title="Bulk assignment results" size="lg">
        <div className="space-y-3 text-sm">
          <p>
            Assigned {outcomes.length - problems.length} of {outcomes.length}.
          </p>
          {problems.length > 0 && (
            <ul className="space-y-1">
              {problems.map((o) => (
                <li key={o.studentUserId}>
                  <span className="font-medium">{nameById[o.studentUserId] ?? o.studentUserId}</span>{' '}
                  <span className={o.status === 'error' ? 'text-error' : 'text-text-muted'}>— {o.message}</span>
                </li>
              ))}
            </ul>
          )}
          {warned.length > 0 && (
            <p className="text-text-muted">
              {warned.length} student{warned.length === 1 ? ' has' : 's have'} UCE eligibility warnings — open them
              from the list to review.
            </p>
          )}
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Assign a combination to several students" size="lg">
      <div className="space-y-5">
        {years.length > 1 && (
          <Select
            label="Academic year"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setSelected(new Set());
              setClassFilter('');
              setChoice(emptyCombinationChoice);
            }}
            options={years.map((y) => ({ value: y.id, label: y.name }))}
          />
        )}

        <CombinationPicker academicYearId={yearId} value={choice} onChange={setChoice} showOverrideNote={false} />

        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Select
                label="Class"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                options={[{ value: '', label: 'All classes' }, ...classes.map((c) => ({ value: c, label: c }))]}
              />
            </div>
            <Button type="button" variant="outline" inline onClick={toggleAllShown} disabled={shown.length === 0}>
              {allShownSelected ? 'Clear shown' : 'Select all shown'}
            </Button>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-text-faint">Every A-Level student here already has a combination.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border">
              {shown.map((s) => (
                <li key={s.userId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(s.userId)}
                      onChange={() => toggle(s.userId)}
                      className="rounded border-border"
                    />
                    <span className="flex-1 font-medium">{studentFullName(s)}</span>
                    <span className="text-xs text-text-muted">{classLabel(s)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-faint">
            {inYear.filter((s) => selected.has(s.userId)).length} selected. Students who already have a combination
            are skipped, not reassigned.
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="button" isLoading={saving} onClick={() => void submit()}>
            Assign combination
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
