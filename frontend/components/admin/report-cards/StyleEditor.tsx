'use client';

import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { SchoolSection } from '@/lib/levels';
import { REPORT_CARD_FIELD_GROUPS, defaultReportCardFields, type ReportCardFields } from './ReportCardSheet';
import {
  ACCENT_SWATCHES,
  COLUMN_LABEL,
  FONT_LABEL,
  type ColumnKey,
  type TemplateDesign,
  type TemplateKind,
  type TemplateStyle,
} from './templates';

// The style builder: what a card shows, the results table's column order,
// colours, frame, font, spacing and wording. Used on its own for a "styled"
// template, and beside the page editor for a "canvas" one (where layout is
// done by dragging, so frame and header alignment don't apply).

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary-700' : 'bg-bg-muted border border-border-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-faint mb-2">{title}</p>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-primary-900">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-md border border-border-strong bg-white px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColourRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-sm text-primary-900 mb-1">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {ACCENT_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={`w-6 h-6 rounded-full border-2 ${value.toLowerCase() === c.toLowerCase() ? 'border-primary-900' : 'border-white'} shadow-sm`}
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Custom ${label.toLowerCase()}`}
          className="h-7 w-9 rounded border border-border-strong"
        />
      </div>
    </div>
  );
}

export function StyleEditor({
  section,
  kind,
  design,
  onChange,
  showPositions,
  onShowPositions,
}: {
  section: SchoolSection;
  kind: TemplateKind;
  design: TemplateDesign;
  onChange: (design: TemplateDesign) => void;
  /** Positions are a section setting, not part of a template. */
  showPositions: boolean;
  onShowPositions: (v: boolean) => void;
}) {
  const fields: ReportCardFields = { ...defaultReportCardFields(section), ...design.fields };
  const setStyle = (patch: Partial<TemplateStyle>) => onChange({ ...design, style: { ...design.style, ...patch } });
  const setText = (patch: Partial<TemplateDesign['text']>) => onChange({ ...design, text: { ...design.text, ...patch } });
  const setField = (key: keyof ReportCardFields, value: boolean) =>
    onChange({ ...design, fields: { ...design.fields, [key]: value } });

  const groups = REPORT_CARD_FIELD_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => f.sections.includes(section)) })).filter(
    (g) => g.fields.length > 0,
  );
  const moveColumn = (index: number, by: number) => {
    const columns = [...design.columns];
    const target = index + by;
    if (target < 0 || target >= columns.length) return;
    [columns[index], columns[target]] = [columns[target], columns[index]];
    onChange({ ...design, columns });
  };
  // A column only shows when its part is switched on (Points only on Primary).
  const columnOn = (key: ColumnKey) =>
    key === 'subject' ||
    (key === 'scores' ? true : key === 'points' ? section === 'PRIMARY' && fields.points : !!fields[key as keyof ReportCardFields]);
  const signatures = design.text.signatures;

  return (
    <div className="space-y-5">
      <Section title="Look">
        <div className="space-y-3">
          <ColourRow label="Main colour" value={design.style.accent} onChange={(accent) => setStyle({ accent })} />
          <ColourRow label="Title badge colour" value={design.style.highlight} onChange={(highlight) => setStyle({ highlight })} />
          <Choice
            label="Font"
            value={design.style.font}
            options={(Object.keys(FONT_LABEL) as TemplateStyle['font'][]).map((f) => ({ value: f, label: FONT_LABEL[f] }))}
            onChange={(font) => setStyle({ font })}
          />
          <Choice
            label="Spacing"
            value={design.style.density}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(density) => setStyle({ density })}
          />
          <Choice
            label="Results table"
            value={design.style.table}
            options={[
              { value: 'bordered', label: 'Grid' },
              { value: 'striped', label: 'Striped rows' },
              { value: 'minimal', label: 'Minimal lines' },
            ]}
            onChange={(table) => setStyle({ table })}
          />
          {kind === 'styled' && (
            <>
              <Choice
                label="Frame"
                value={design.style.frame}
                options={[
                  { value: 'double', label: 'Double (certificate)' },
                  { value: 'single', label: 'Single' },
                  { value: 'none', label: 'None' },
                ]}
                onChange={(frame) => setStyle({ frame })}
              />
              <Choice
                label="Header"
                value={design.style.header}
                options={[
                  { value: 'centered', label: 'Centred' },
                  { value: 'left', label: 'Left-aligned' },
                ]}
                onChange={(header) => setStyle({ header })}
              />
            </>
          )}
        </div>
      </Section>

      <Section title="Wording">
        <div className="space-y-2.5">
          <label className="block">
            <span className="block text-sm text-primary-900 mb-1">Title badge</span>
            <input
              value={design.text.title}
              maxLength={40}
              onChange={(e) => setText({ title: e.target.value })}
              placeholder="Report Card (empty hides it)"
              className="w-full h-9 rounded-md border border-border-strong px-2.5 text-sm"
            />
          </label>
          <div>
            <span className="block text-sm text-primary-900 mb-1">Signature lines</span>
            <div className="space-y-1.5">
              {signatures.map((label, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={label}
                    maxLength={60}
                    onChange={(e) => setText({ signatures: signatures.map((s, j) => (j === i ? e.target.value : s)) })}
                    className="flex-1 h-8 rounded-md border border-border-strong px-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setText({ signatures: signatures.filter((_, j) => j !== i) })}
                    aria-label="Remove signature line"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border-strong text-text-muted hover:text-error"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              {signatures.length < 4 && (
                <button
                  type="button"
                  onClick={() => setText({ signatures: [...signatures, 'Signature'] })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add a signature line
                </button>
              )}
            </div>
          </div>
          <label className="block">
            <span className="block text-sm text-primary-900 mb-1">Footer note</span>
            <textarea
              value={design.text.footerNote}
              maxLength={300}
              rows={3}
              onChange={(e) => setText({ footerNote: e.target.value })}
              placeholder="e.g. Next term begins on 2 February. Fees must be cleared before reporting."
              className="w-full rounded-md border border-border-strong px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
      </Section>

      <Section title="Results table columns">
        <p className="text-xs text-text-muted mb-2">Use the arrows to reorder. Switch columns on or off below.</p>
        <ul className="rounded-md border border-border divide-y divide-border">
          {design.columns.map((key, i) => (
            <li key={key} className={`flex items-center justify-between px-2 py-1 text-sm ${columnOn(key) ? 'text-primary-900' : 'text-text-faint'}`}>
              {COLUMN_LABEL[key]}
              {!columnOn(key) && <span className="ml-auto mr-2 text-[11px]">off</span>}
              <span className="flex">
                <button type="button" onClick={() => moveColumn(i, -1)} disabled={i === 0} aria-label={`Move ${COLUMN_LABEL[key]} left`} className="p-1 disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(i, 1)}
                  disabled={i === design.columns.length - 1}
                  aria-label={`Move ${COLUMN_LABEL[key]} right`}
                  className="p-1 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {groups.map((group) => (
        <Section key={group.title} title={`Show — ${group.title}`}>
          <ul className="space-y-2.5">
            {group.fields.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-3">
                <span className="text-sm text-primary-900">
                  {f.label}
                  {f.hint && <span className="block text-xs text-text-muted">{f.hint}</span>}
                </span>
                <Switch label={f.label} checked={fields[f.key]} onChange={(v) => setField(f.key, v)} />
              </li>
            ))}
            {group.title === 'Learner details' && (
              <li className="flex items-start justify-between gap-3">
                <span className="text-sm text-primary-900">
                  Position in class
                  <span className="block text-xs text-text-muted">For every template in this section, e.g. &ldquo;7 of 39&rdquo;.</span>
                </span>
                <Switch label="Position in class" checked={showPositions} onChange={onShowPositions} />
              </li>
            )}
          </ul>
        </Section>
      ))}
    </div>
  );
}
