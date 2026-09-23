'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { DAY_NAMES, type Period, type Slot } from './types';

export interface SubjectOption {
  id: string;
  name: string;
}
export interface TeacherOption {
  userId: string;
  name: string;
}

/**
 * Put a lesson in one cell: a subject (the teacher is pre-filled from who's
 * assigned to teach it here) or a free activity, plus an optional room. The
 * server refuses clashes and says what's in the way.
 */
export function SlotModal({
  termId,
  classId,
  streamId,
  day,
  period,
  slot,
  subjects,
  teachers,
  allowActivity,
  onClose,
  onSaved,
}: {
  termId: string;
  classId: string;
  streamId: string | null;
  day: number;
  period: Period;
  slot: Slot | null;
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  /** Nursery lessons are often activities rather than subjects. */
  allowActivity: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'subject' | 'activity'>(slot?.activity ? 'activity' : 'subject');
  const [subjectId, setSubjectId] = useState(slot?.subjectId ?? '');
  const [activity, setActivity] = useState(slot?.activity ?? '');
  const [staffId, setStaffId] = useState(slot?.staffId ?? '');
  const [room, setRoom] = useState(slot?.room ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picking a subject pre-fills whoever is assigned to teach it here.
  useEffect(() => {
    if (!subjectId || subjectId === slot?.subjectId) return;
    let cancelled = false;
    void (async () => {
      const qs = new URLSearchParams({ classId, subjectId });
      if (streamId) qs.set('streamId', streamId);
      const res = await fetch(`/api/v1/timetable/suggest-teacher?${qs.toString()}`, { credentials: 'include' });
      const body = await res.json().catch(() => null);
      if (!cancelled && body?.data?.staffId) setStaffId(body.data.staffId);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId, classId, streamId, slot?.subjectId]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await submitJson('/api/v1/timetable/slot', 'PUT', {
      termId,
      classId,
      streamId,
      dayOfWeek: day,
      periodId: period.id,
      subjectId: mode === 'subject' ? subjectId || null : null,
      activity: mode === 'activity' ? activity.trim() || null : null,
      staffId: staffId || null,
      room: room.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      // Clashes come back as a sentence ("… is already teaching …") — show it inline.
      setError(res.error ?? 'Could not save this lesson.');
      return;
    }
    await onSaved();
    onClose();
  }

  async function remove() {
    if (!slot) return;
    setSaving(true);
    const res = await submitJson(`/api/v1/timetable/slot/${slot.id}`, 'DELETE');
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    await onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`${DAY_NAMES[day]} · ${period.label} (${period.startTime}–${period.endTime})`}>
      <div className="space-y-3">
        {allowActivity && (
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['subject', 'activity'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  mode === m ? 'bg-primary-700 text-white' : 'text-text-muted'
                }`}
              >
                {m === 'subject' ? 'Subject' : 'Activity'}
              </button>
            ))}
          </div>
        )}
        {mode === 'subject' ? (
          <Select
            label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            options={[{ value: '', label: 'Choose a subject…' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
          />
        ) : (
          <Input
            label="Activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="Story time, Games, Rest…"
            maxLength={80}
          />
        )}
        <Select
          label="Teacher"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={[{ value: '', label: 'No teacher' }, ...teachers.map((t) => ({ value: t.userId, label: t.name }))]}
        />
        <Input label="Room (optional)" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={40} />
        {error && (
          <p role="alert" className="rounded-lg bg-error-bg px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            inline
            onClick={() => void save()}
            isLoading={saving}
            disabled={mode === 'subject' ? !subjectId : !activity.trim()}
          >
            Save
          </Button>
          {slot && (
            <Button inline variant="outline" onClick={() => void remove()} disabled={saving}>
              Clear this lesson
            </Button>
          )}
          <Button inline variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
