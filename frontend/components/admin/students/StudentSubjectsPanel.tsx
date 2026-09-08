'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import type { SchoolCombination, SubjectOffering } from '../subjects/types';
import type { EnrollmentRecord, StudentCombination, StudentSubject } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Controlled building blocks — no API writes of their own. Used both by the
// admission wizard (before the student exists) and by the live panels below.
// ─────────────────────────────────────────────────────────────────────────────

export interface CombinationChoice {
  schoolCombinationId: string;
  subsidiarySubjectId: string | null;
  overrideReason: string | null;
}

export const emptyCombinationChoice: CombinationChoice = {
  schoolCombinationId: '',
  subsidiarySubjectId: null,
  overrideReason: null,
};

/** Combination + subsidiary + an optional "why proceed" note. Pure form state. */
export function CombinationPicker({
  academicYearId,
  value,
  onChange,
}: {
  academicYearId: string;
  value: CombinationChoice;
  onChange: (next: CombinationChoice) => void;
}) {
  const [offered, setOffered] = useState<SchoolCombination[]>([]);

  useEffect(() => {
    if (!academicYearId) return;
    void fetchList<SchoolCombination>(
      `/api/v1/academic/school-combinations?academicYearId=${academicYearId}`,
    ).then((list) => setOffered(list.filter((c) => c.isOffered)));
  }, [academicYearId]);

  const selected = offered.find((c) => c.id === value.schoolCombinationId);
  const subsidiaryOptions = selected?.subjects.filter((s) => s.role === 'subsidiary') ?? [];

  return (
    <div className="space-y-3">
      <Select
        label="Combination"
        value={value.schoolCombinationId}
        onChange={(e) =>
          onChange({ ...value, schoolCombinationId: e.target.value, subsidiarySubjectId: null })
        }
        options={[
          { value: '', label: offered.length ? 'Select a combination…' : 'No combinations offered yet' },
          ...offered.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
        ]}
      />
      {subsidiaryOptions.length > 1 && (
        <Select
          label="Subsidiary"
          value={value.subsidiarySubjectId ?? ''}
          onChange={(e) => onChange({ ...value, subsidiarySubjectId: e.target.value || null })}
          options={[
            { value: '', label: 'Select a subsidiary…' },
            ...subsidiaryOptions.map((s) => ({ value: s.subjectId, label: s.subjectName })),
          ]}
        />
      )}
      <label className="block text-sm">
        <span className="text-xs font-medium text-text-muted">
          Eligibility override note <span className="text-text-faint">(optional)</span>
        </span>
        <textarea
          value={value.overrideReason ?? ''}
          onChange={(e) => onChange({ ...value, overrideReason: e.target.value || null })}
          rows={2}
          placeholder="If the student's UCE grades fall short of a principal subject, note why you're proceeding."
          className="mt-1 w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm"
        />
      </label>
    </div>
  );
}

/**
 * O-Level subject checklist as pure form state. Compulsory offerings are
 * always included and locked; `value` is the full set of subject ids to
 * register (compulsory + chosen optionals).
 */
export function OLevelOptionalsChecklist({
  academicYearId,
  value,
  onChange,
}: {
  academicYearId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);

  useEffect(() => {
    if (!academicYearId) return;
    void fetchList<SubjectOffering>(
      `/api/v1/academic/subject-offerings?academicYearId=${academicYearId}&phase=O_LEVEL`,
    ).then((list) => setOfferings(list.filter((o) => o.isOffered)));
  }, [academicYearId]);

  const compulsoryIds = useMemo(
    () => offerings.filter((o) => o.isCompulsory).map((o) => o.subjectId),
    [offerings],
  );

  // Keep every compulsory subject in the selection once offerings load.
  useEffect(() => {
    const missing = compulsoryIds.filter((id) => !value.includes(id));
    if (missing.length) onChange([...value, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compulsoryIds]);

  if (offerings.length === 0) {
    return (
      <p className="text-sm text-text-faint">
        This school hasn&apos;t set up any O-Level subjects yet — do that under Curriculum &amp;
        Subjects first.
      </p>
    );
  }

  const optionalCount = value.filter((id) => !compulsoryIds.includes(id)).length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        Core subjects are added automatically. Pick the optionals — usually 2.{' '}
        <span className="font-medium">{optionalCount} chosen.</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {offerings.map((o) => {
          const checked = value.includes(o.subjectId);
          return (
            <label key={o.subjectId} className="flex items-center gap-2 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={checked}
                disabled={o.isCompulsory}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, o.subjectId]
                      : value.filter((id) => id !== o.subjectId),
                  )
                }
                className="rounded border-[#E5E5E5] disabled:opacity-60"
              />
              {o.subjectName}
              {o.isCompulsory && <Badge variant="muted">compulsory</Badge>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function EligibilityWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-accent-light bg-accent-lighter p-2.5 text-xs text-accent-dark">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <ul className="space-y-0.5">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live panels — used by the student detail modal and the roster pages.
// ─────────────────────────────────────────────────────────────────────────────

// O-Level: a checklist of what the school offers, checked = registered
// (active/added), unchecked = not taken/dropped. Compulsory subjects can't
// be unchecked here — the backend enforces this too (§2.4), this just avoids
// a round-trip for the obvious case.
export function OLevelSubjects({
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
export function ALevelCombination({
  studentUserId,
  enrollment,
}: {
  studentUserId: string;
  enrollment: EnrollmentRecord;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<StudentCombination | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<CombinationChoice>(emptyCombinationChoice);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const curRes = await fetch(
      `/api/v1/students/${studentUserId}/combination?academicYearId=${enrollment.academicYearId}`,
      { credentials: 'include' },
    ).then((r) => r.json());
    setCurrent(curRes.success ? curRes.data : null);
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentUserId, enrollment.academicYearId]);

  async function submit(reassign: boolean) {
    if (!choice.schoolCombinationId) {
      toast.error('Pick a combination.');
      return;
    }
    setSaving(true);
    const path = reassign ? 'combination/reassign' : 'combination';
    const res = await submitJson<StudentCombination>(`/api/v1/students/${studentUserId}/${path}`, 'POST', {
      academicYearId: enrollment.academicYearId,
      schoolCombinationId: choice.schoolCombinationId,
      subsidiarySubjectId: choice.subsidiarySubjectId,
      overrideReason: choice.overrideReason,
    });
    setSaving(false);
    if (res.ok) {
      const warned = res.data?.warnings?.length ?? 0;
      toast.success(
        (reassign ? 'Combination reassigned.' : 'Combination confirmed.') +
          (warned ? ` ${warned} eligibility warning${warned > 1 ? 's' : ''} recorded.` : ''),
      );
      setPicking(false);
      setChoice(emptyCombinationChoice);
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  if (current === undefined) return <p className="text-sm text-text-faint">Loading…</p>;

  return (
    <div className="space-y-3">
      {current ? (
        <div className="rounded-xl border border-border p-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              <Badge variant="default">{current.combinationCode}</Badge> {current.combinationName}
            </div>
            <Button type="button" variant="outline" inline onClick={() => setPicking((v) => !v)}>
              Reassign
            </Button>
          </div>
          <div className="text-text-faint">
            {current.members.map((m) => `${m.subjectCode}${m.role === 'principal' ? '' : ` (${m.role})`}`).join(', ')}
          </div>
          <EligibilityWarnings warnings={current.warnings} />
          {current.eligibilityOverrideReason && (
            <p className="text-xs text-text-faint">
              Override note: {current.eligibilityOverrideReason}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-muted">No combination selected yet.</p>
      )}

      {(picking || !current) && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <CombinationPicker
            academicYearId={enrollment.academicYearId}
            value={choice}
            onChange={setChoice}
          />
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
