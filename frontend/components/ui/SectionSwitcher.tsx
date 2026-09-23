'use client';

import { SECTION_LABEL, switchSection, useSchoolSections } from '@/lib/levels';

/**
 * Nursery | Primary toggle for a school that runs more than one section. Each
 * section is effectively its own school — classes, pupils, subjects, exams
 * and reports all follow the one picked here. Renders nothing for a
 * single-section school.
 */
export function SectionSwitcher({ compact = false }: { compact?: boolean }) {
  const { sections, active } = useSchoolSections();
  if (sections.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="School section"
      className="inline-flex items-center rounded-xl border border-border bg-bg-subtle p-0.5 shrink-0"
    >
      {sections.map((s) => {
        const selected = s === active;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => !selected && switchSection(s)}
            className={`${compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} rounded-lg font-semibold transition-colors ${
              selected ? 'bg-primary-700 text-white shadow-sm' : 'text-text-muted hover:text-primary-900'
            }`}
          >
            {SECTION_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
