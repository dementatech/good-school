'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { LEVEL_LABEL, type SubjectPhase } from '@/lib/levels';

/**
 * Add or rename one of the school's OWN subjects — every Nursery subject, or a
 * non-examinable extra at another level (Computer, French, ...). No approval:
 * it's the school's, and private to it.
 */
export function SchoolSubjectModal({
  open,
  onClose,
  onSaved,
  phase,
  academicYearId,
  subject,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  phase: SubjectPhase;
  academicYearId: string;
  /** Present when renaming. */
  subject?: { id: string; name: string; shortName: string };
}) {
  const toast = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [shortName, setShortName] = useState(subject?.shortName ?? '');
  const [maxMark, setMaxMark] = useState('100');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = subject
      ? await submitJson(`/api/v1/academic/school-subjects/${subject.id}`, 'PATCH', {
          name: name.trim(),
          shortName: shortName.trim(),
        })
      : await submitJson(`/api/v1/academic/school-subjects?academicYearId=${academicYearId}`, 'POST', {
          phase,
          name: name.trim(),
          shortName: shortName.trim(),
          maxMark: Number(maxMark) || 100,
        });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success(subject ? 'Subject updated.' : `${name.trim()} added.`);
    await onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? `Edit ${subject.name}` : `Add a ${LEVEL_LABEL[phase]} subject`}
    >
      <form onSubmit={save} className="space-y-3">
        {!subject && phase !== 'KINDERGARTEN' && (
          <p className="text-xs text-text-muted">
            Your school&apos;s own subject — taught and reported, but not part of national exam grading. It&apos;s
            ready to use straight away.
          </p>
        )}
        <Input
          label="Subject name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={phase === 'KINDERGARTEN' ? 'Number Work' : 'Computer Studies'}
          required
        />
        <Input
          label="Short name *"
          value={shortName}
          onChange={(e) => setShortName(e.target.value.toUpperCase())}
          placeholder={phase === 'KINDERGARTEN' ? 'NUM' : 'COMP'}
          maxLength={12}
          required
        />
        {!subject && (
          <Input
            label="Marked out of"
            type="number"
            min={1}
            max={999}
            value={maxMark}
            onChange={(e) => setMaxMark(e.target.value)}
          />
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving} disabled={!name.trim() || !shortName.trim()}>
            {subject ? 'Save' : 'Add subject'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
