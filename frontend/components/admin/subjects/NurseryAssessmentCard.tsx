'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson } from '@/lib/api/envelope';
import { invalidateSchoolLevels, type NurseryAssessment } from '@/lib/levels';

const OPTIONS: { value: NurseryAssessment; title: string; body: string }[] = [
  {
    value: 'ratings',
    title: 'Progress ratings',
    body: 'Emerging / Developing / Proficient per learning area. No marks, grades or positions.',
  },
  {
    value: 'marks',
    title: 'Marks and grades',
    body: 'Subjects, exams and marks (out of 100, 50, … per subject), grades and a report card.',
  },
  {
    value: 'both',
    title: 'Both',
    body: 'Marks and grades, with the progress ratings printed on the same report card.',
  },
];

/**
 * How this school assesses its Nursery — its own call, since there's no
 * national nursery exam. Switching to marks sets up starter subjects, a
 * grading scheme and the class teachers' mark sheets; nothing is lost when
 * switching back.
 */
export function NurseryAssessmentCard({
  current,
  showPositions,
}: {
  current: NurseryAssessment;
  showPositions: boolean;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function save(body: { assessmentStyle?: NurseryAssessment; showPositions?: boolean }) {
    setSaving(true);
    const res = await submitJson('/api/v1/academic/section-settings', 'PUT', { section: 'KINDERGARTEN', ...body });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.error!);
      return;
    }
    // Menus and pages depend on this — reload so they all follow.
    invalidateSchoolLevels();
    window.location.reload();
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-primary-900">How is your Nursery assessed?</h2>
        <p className="text-xs text-text-muted">Your school&apos;s choice — you can change it at any time.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const selected = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              disabled={saving || selected}
              onClick={() => void save({ assessmentStyle: o.value })}
              className={`text-left rounded-xl border p-3 transition-colors ${
                selected ? 'border-primary-700 bg-primary-50' : 'border-border hover:border-primary-700'
              }`}
            >
              <span className="block text-sm font-semibold text-primary-900">
                {o.title}
                {o.value === 'ratings' && <span className="ml-1.5 text-xs font-normal text-text-faint">(default)</span>}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">{o.body}</span>
            </button>
          );
        })}
      </div>
      {current !== 'ratings' && (
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={showPositions}
            disabled={saving}
            onChange={(e) => void save({ showPositions: e.target.checked })}
            className="rounded border-[#E5E5E5]"
          />
          Show each pupil&apos;s position (class ranking) on Nursery report cards
        </label>
      )}
    </Card>
  );
}
