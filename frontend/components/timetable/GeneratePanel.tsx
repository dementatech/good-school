'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Shuffle, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { TimetableGrid } from './TimetableGrid';
import type { Period, SchoolSection, Slot } from './types';

// Mirrors backend/src/modules/timetable/domain/generator.ts

interface GeneratedLesson {
  classId: string;
  streamId: string | null;
  dayOfWeek: number;
  periodId: string;
  subjectId: string;
  staffId: string | null;
}

interface Plan {
  seed: number;
  days: number[];
  periods: Period[];
  units: {
    key: string;
    classId: string;
    className: string;
    streamId: string | null;
    streamName: string | null;
    capacity: number;
    filled: number;
  }[];
  subjects: { subjectId: string; name: string; shortName: string | null; autoLessons: number; lessonsPerWeek: number | null }[];
  slots: Slot[];
  lessons: GeneratedLesson[];
  unplaced: { unitKey: string; unitName: string; subjectName: string; teacherName: string | null; missing: number }[];
  warnings: string[];
  replaces: number;
}

const SECTION_NAME: Record<SchoolSection, string> = {
  KINDERGARTEN: 'Nursery',
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
};

/** One click to a draft of the whole section's week — previewed here, saved
 * only when the admin applies it. The class grids stay the place to adjust. */
export function GeneratePanel({
  termId,
  section,
  onApplied,
}: {
  termId: string;
  section: SchoolSection;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [keepExisting, setKeepExisting] = useState(false);
  // The school's own lessons-per-week, as typed ('' = let the generator decide).
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [unitKey, setUnitKey] = useState('');
  const [busy, setBusy] = useState<'generate' | 'apply' | null>(null);

  async function generate(seed?: number) {
    setBusy('generate');
    const lessonsPerWeek = Object.fromEntries(
      Object.entries(fixed)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => [k, Math.max(0, Math.min(20, Math.round(Number(v))))]),
    );
    const res = await submitJson<Plan>('/api/v1/timetable/generate', 'POST', {
      termId,
      section,
      keepExisting,
      lessonsPerWeek,
      ...(seed !== undefined ? { seed } : {}),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    setPlan(res.data!);
    if (!res.data!.units.some((u) => u.key === unitKey)) setUnitKey(res.data!.units[0]?.key ?? '');
  }

  async function apply() {
    if (!plan) return;
    const sectionName = SECTION_NAME[section];
    const message =
      plan.replaces > 0
        ? `Apply this timetable? It replaces the ${plan.replaces} lessons already on the ${sectionName} timetable for this term.`
        : `Apply this timetable to the ${sectionName} classes for this term?`;
    if (!confirm(message)) return;
    setBusy('apply');
    const res = await submitJson<{ created: number; removed: number }>('/api/v1/timetable/generate/apply', 'POST', {
      termId,
      section,
      keepExisting,
      lessons: plan.lessons,
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success(`Timetable applied — ${res.data!.created} lessons placed.`);
    setPlan(null);
    onApplied();
  }

  const unit = plan?.units.find((u) => u.key === unitKey) ?? plan?.units[0] ?? null;
  const unitSlots = useMemo(
    () =>
      plan && unit
        ? plan.slots.filter((s) => s.classId === unit.classId && (!s.streamId || s.streamId === unit.streamId))
        : [],
    [plan, unit],
  );
  const missing = plan?.unplaced.reduce((a, u) => a + u.missing, 0) ?? 0;
  const teachers = plan ? new Set(plan.lessons.map((l) => l.staffId).filter(Boolean)).size : 0;

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
            <Wand2 className="w-5 h-5" aria-hidden />
          </div>
          <div>
            <p className="font-bold text-primary-900">Generate the {SECTION_NAME[section]} timetable</p>
            <p className="text-sm text-text-muted max-w-3xl">
              Builds every class&apos;s week from your classes, the subjects they take and the teachers assigned to them —
              no teacher in two places, each subject spread across the week, core subjects in the morning. Nothing is
              saved until you apply it, and you can still adjust any lesson afterwards.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-primary-900">
            <input
              type="checkbox"
              checked={keepExisting}
              onChange={(e) => setKeepExisting(e.target.checked)}
              className="rounded border-[#E5E5E5]"
            />
            Keep lessons already on the timetable and fill around them
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            {plan && (
              <Button
                inline
                variant="outline"
                onClick={() => void generate(Math.floor(Math.random() * 1e9))}
                disabled={busy !== null}
              >
                <Shuffle className="w-4 h-4" aria-hidden />
                Another arrangement
              </Button>
            )}
            <Button inline onClick={() => void generate()} isLoading={busy === 'generate'} disabled={busy !== null}>
              <Sparkles className="w-4 h-4" aria-hidden />
              {plan ? 'Generate again' : 'Generate timetable'}
            </Button>
          </div>
        </div>
      </Card>

      {plan && (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="space-y-3 self-start">
            <div>
              <p className="text-sm font-bold text-primary-900">Lessons per week</p>
              <p className="text-xs text-text-muted">
                Blank shares the week out automatically (shown in grey). Type a number to fix it, then generate again.
              </p>
            </div>
            <ul className="space-y-2">
              {plan.subjects.map((s) => (
                <li key={s.subjectId} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-primary-900 min-w-0 truncate" title={s.name}>
                    {s.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    inputMode="numeric"
                    aria-label={`${s.name} lessons per week`}
                    value={fixed[s.subjectId] ?? ''}
                    placeholder={String(s.autoLessons)}
                    onChange={(e) => setFixed((f) => ({ ...f, [s.subjectId]: e.target.value }))}
                    className="w-16 h-9 rounded-lg border border-border bg-bg-card px-2 text-sm text-right tabular-nums placeholder:text-text-faint"
                  />
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Summary label="Classes" value={plan.units.length} />
              <Summary label="Lessons placed" value={plan.lessons.length} />
              <Summary label="Teachers" value={teachers} />
              <Summary label="Couldn't place" value={missing} warn={missing > 0} />
            </div>

            {plan.warnings.length > 0 || missing > 0 ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-1.5">
                {plan.warnings.map((w) => (
                  <p key={w} className="text-sm text-primary-900 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden />
                    {w}
                  </p>
                ))}
                {plan.unplaced.slice(0, 8).map((u) => (
                  <p key={`${u.unitKey}-${u.subjectName}`} className="text-sm text-primary-900 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden />
                    {u.unitName}: {u.missing} {u.subjectName} lesson{u.missing === 1 ? '' : 's'} didn&apos;t fit
                    {u.teacherName ? ` (${u.teacherName} is fully booked)` : ''}.
                  </p>
                ))}
                {plan.unplaced.length > 8 && (
                  <p className="text-xs text-text-muted pl-6">…and {plan.unplaced.length - 8} more.</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-success/30 bg-success/10 p-4">
                <p className="text-sm text-primary-900 flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden />
                  Every lesson fits — no teacher clashes, every class&apos;s week is full.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Class">
              {plan.units.map((u) => {
                const active = u.key === unit?.key;
                return (
                  <button
                    key={u.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setUnitKey(u.key)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'border-primary-700 bg-primary-700 text-white'
                        : 'border-border bg-bg-card text-primary-900 hover:border-primary-700/40'
                    }`}
                  >
                    {u.streamName ? `${u.className} ${u.streamName}` : u.className}
                    <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-text-faint'}`}>
                      {u.filled}/{u.capacity}
                    </span>
                  </button>
                );
              })}
            </div>

            {unit && <TimetableGrid periods={plan.periods} days={plan.days} slots={unitSlots} />}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-xs text-text-faint mr-auto">
                A draft — nothing has been saved yet.
                {plan.replaces > 0 && ` Applying replaces the ${plan.replaces} lessons already on this term's timetable.`}
              </p>
              <Button inline onClick={() => void apply()} isLoading={busy === 'apply'} disabled={busy !== null}>
                <CheckCircle2 className="w-4 h-4" aria-hidden />
                Apply to timetable
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-warning' : 'text-primary-900'}`}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}
