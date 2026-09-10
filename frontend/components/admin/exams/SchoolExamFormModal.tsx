'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList } from '@/lib/api/envelope';
import { submitJson, type ExamSession, type SchoolExam } from './types';

export function SchoolExamFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Omit to create; pass to edit an existing exam (session is fixed on edit). */
  initial?: SchoolExam;
}) {
  const toast = useToast();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [examSessionId, setExamSessionId] = useState(initial?.examSessionId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  // Tracks whether the user has hand-edited the name — until they do, it
  // mirrors the chosen session's name.
  const [nameTouched, setNameTouched] = useState(Boolean(initial));
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [marksDueOn, setMarksDueOn] = useState(initial?.marksDueOn ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return;
    void fetchList<ExamSession>('/api/v1/exams/sessions').then(setSessions);
  }, [initial]);

  // Until the user hand-edits the name, it mirrors the chosen session's name.
  // Done here (not in an effect) so there's no cascading re-render.
  function pickSession(id: string) {
    setExamSessionId(id);
    if (!nameTouched) {
      const s = sessions.find((x) => x.id === id);
      setName(s?.examName ?? '');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!initial && !examSessionId) {
      toast.error('Pick an exam session.');
      return;
    }
    if (!startsOn || !endsOn || !marksDueOn) {
      toast.error('All three dates are required.');
      return;
    }
    if (!(startsOn <= endsOn && endsOn <= marksDueOn)) {
      toast.error('Dates must run: start ≤ end ≤ marks due.');
      return;
    }
    setSaving(true);
    const res = initial
      ? await submitJson(`/api/v1/exams/${initial.id}`, 'PATCH', {
          name: name.trim() || null,
          startsOn,
          endsOn,
          marksDueOn,
        })
      : await submitJson('/api/v1/exams', 'POST', {
          examSessionId,
          name: name.trim() || null,
          startsOn,
          endsOn,
          marksDueOn,
        });
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Exam updated.' : 'Exam created and activated.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.name}` : 'Create exam'}>
      <form onSubmit={submit} className="space-y-4">
        {initial ? (
          <p className="text-sm text-text-muted">
            {initial.examCode} · {initial.academicYearName} · {initial.termName} — the year and term
            can&apos;t be changed. Adjust the name or dates below.
          </p>
        ) : (
          <>
            <Select
              label="Exam session *"
              value={examSessionId}
              onChange={(e) => pickSession(e.target.value)}
              options={[
                { value: '', label: sessions.length ? 'Pick an exam session…' : 'No exam sessions available' },
                ...sessions.map((s) => ({ value: s.id, label: `${s.examName} (${s.examCode})` })),
              ]}
            />
            <p className="text-xs text-text-muted">
              The current academic year and current term are attached automatically.
            </p>
          </>
        )}

        <Input
          label="Exam name *"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder="Defaults to the exam session name"
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Starts on *" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
          <Input label="Ends on *" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
          <Input label="Marks due *" type="date" value={marksDueOn} onChange={(e) => setMarksDueOn(e.target.value)} required />
        </div>
        <p className="text-xs text-text-muted">
          Mark entry is open from the start date through the marks-due date while the exam is active.
        </p>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Create & activate'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
