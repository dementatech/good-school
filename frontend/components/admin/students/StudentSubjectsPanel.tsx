'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import type { SchoolCombination, SubjectOffering } from '../subjects/types';
import type { EnrollmentRecord, StudentCombination, StudentSubject } from './types';

// O-Level: a checklist of what the school offers, checked = registered
// (active/added), unchecked = not taken/dropped. Compulsory subjects can't
// be unchecked here — the backend enforces this too (§2.4), this just avoids
// a round-trip for the obvious case.
function OLevelSubjects({
  studentUserId,
  enrollment,
}: {
  studentUserId: string;
  enrollment: EnrollmentRecord;
}) {
  const toast = useToast();
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);
  const [registered, setRegistered] = useState<StudentSubject[]>([]);

  const load = async () => {
    const [offeringsRes, subjectsRes] = await Promise.all([
      fetchList<SubjectOffering>(
        `/api/v1/academic/subject-offerings?academicYearId=${enrollment.academicYearId}&phase=O_LEVEL`,
      ),
      fetchList<StudentSubject>(`/api/v1/students/${studentUserId}/subjects?academicYearId=${enrollment.academicYearId}`),
    ]);
    setOfferings(offeringsRes.filter((o) => o.isOffered));
    setRegistered(subjectsRes);
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId, enrollment.academicYearId]);

  const activeById = new Map(registered.filter((r) => r.status !== 'dropped').map((r) => [r.subjectId, r]));

  async function toggle(subjectId: string, checked: boolean) {
    if (checked) {
      const res = await submitJson(`/api/v1/students/${studentUserId}/subjects`, 'POST', {
        subjectId,
        academicYearId: enrollment.academicYearId,
      });
      if (res.ok) await load();
      else toast.error(res.error!);
    } else {
      const res = await submitJson(`/api/v1/students/${studentUserId}/subjects/${subjectId}/drop`, 'POST', {
        academicYearId: enrollment.academicYearId,
      });
      if (res.ok) await load();
      else toast.error(res.error!);
    }
  }

  if (offerings.length === 0) {
    return <p className="text-sm text-text-faint">This school hasn&apos;t set up any O-Level subjects yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {offerings.map((o) => (
        <label key={o.subjectId} className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={activeById.has(o.subjectId)}
            disabled={o.isCompulsory && activeById.has(o.subjectId)}
            onChange={(e) => void toggle(o.subjectId, e.target.checked)}
            className="rounded border-[#E5E5E5] disabled:opacity-60"
          />
          {o.subjectName}
          {o.isCompulsory && <Badge variant="muted">compulsory</Badge>}
        </label>
      ))}
    </div>
  );
}

// A-Level: the single atomic combination choice — a picker when there isn't
// one yet, otherwise the current combination + a "Reassign" escape hatch
// (§3.4 — reassignment is the exception path, not the default flow).
function ALevelCombination({
  studentUserId,
  enrollment,
}: {
  studentUserId: string;
  enrollment: EnrollmentRecord;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<StudentCombination | null | undefined>(undefined);
  const [offered, setOffered] = useState<SchoolCombination[]>([]);
  const [picking, setPicking] = useState(false);
  const [combinationId, setCombinationId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [curRes, offeredRes] = await Promise.all([
      fetch(`/api/v1/students/${studentUserId}/combination?academicYearId=${enrollment.academicYearId}`, {
        credentials: 'include',
      }).then((r) => r.json()),
      fetchList<SchoolCombination>(`/api/v1/academic/school-combinations?academicYearId=${enrollment.academicYearId}`),
    ]);
    setCurrent(curRes.success ? curRes.data : null);
    setOffered(offeredRes.filter((c) => c.isOffered));
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId, enrollment.academicYearId]);

  const selectedCombo = offered.find((c) => c.id === combinationId);
  const subsidiaryOptions = selectedCombo?.subjects.filter((s) => s.role === 'subsidiary') ?? [];

  async function submit(reassign: boolean) {
    if (!combinationId) {
      toast.error('Pick a combination.');
      return;
    }
    if (subsidiaryOptions.length > 1 && !subsidiaryId) {
      toast.error('This combination offers more than one subsidiary — pick one.');
      return;
    }
    setSaving(true);
    const path = reassign ? 'combination/reassign' : 'combination';
    const res = await submitJson(`/api/v1/students/${studentUserId}/${path}`, 'POST', {
      academicYearId: enrollment.academicYearId,
      schoolCombinationId: combinationId,
      subsidiarySubjectId: subsidiaryOptions.length > 1 ? subsidiaryId : null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(reassign ? 'Combination reassigned.' : 'Combination confirmed.');
      setPicking(false);
      setCombinationId('');
      setSubsidiaryId('');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  if (current === undefined) return <p className="text-sm text-text-faint">Loading…</p>;

  return (
    <div className="space-y-3">
      {current ? (
        <div className="rounded-xl border border-border p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              <Badge variant="default">{current.combinationCode}</Badge> {current.combinationName}
            </div>
            <Button type="button" variant="outline" inline onClick={() => setPicking((v) => !v)}>
              Reassign
            </Button>
          </div>
          <div className="text-text-faint mt-1">
            {current.members.map((m) => `${m.subjectCode}${m.role === 'principal' ? '' : ` (${m.role})`}`).join(', ')}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No combination selected yet.</p>
      )}

      {(picking || !current) && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <Select
            label="Combination"
            value={combinationId}
            onChange={(e) => {
              setCombinationId(e.target.value);
              setSubsidiaryId('');
            }}
            options={[
              { value: '', label: offered.length ? 'Select a combination…' : 'No combinations offered yet' },
              ...offered.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
            ]}
          />
          {subsidiaryOptions.length > 1 && (
            <Select
              label="Subsidiary"
              value={subsidiaryId}
              onChange={(e) => setSubsidiaryId(e.target.value)}
              options={[
                { value: '', label: 'Select a subsidiary…' },
                ...subsidiaryOptions.map((s) => ({ value: s.subjectId, label: s.subjectName })),
              ]}
            />
          )}
          <Button type="button" isLoading={saving} inline onClick={() => void submit(Boolean(current))}>
            {current ? 'Confirm reassignment' : 'Confirm combination'}
          </Button>
        </div>
      )}
    </div>
  );
}

export function StudentSubjectsPanel({
  studentUserId,
  enrollment,
}: {
  studentUserId: string;
  enrollment: EnrollmentRecord | null;
}) {
  if (!enrollment) {
    return <p className="text-sm text-text-faint">Enrol the student in a class first.</p>;
  }
  return enrollment.stagePhase === 'A_LEVEL' ? (
    <ALevelCombination studentUserId={studentUserId} enrollment={enrollment} />
  ) : (
    <OLevelSubjects studentUserId={studentUserId} enrollment={enrollment} />
  );
}
