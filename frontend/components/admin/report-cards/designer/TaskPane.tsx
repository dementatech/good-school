'use client';

import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import type { SchoolSection } from '@/lib/levels';
import { REPORT_CARD_FIELD_GROUPS, defaultReportCardFields, type ReportCardFields } from '../ReportCardSheet';
import {
  BLOCK_INFO,
  COLUMN_LABEL,
  CONDITION_OPS,
  DATA_FIELD,
  DATA_FIELDS,
  OP_LABEL,
  PAGE_MM,
  type CanvasBlock,
  type ColumnKey,
  type Condition,
  type DataKey,
  type HighlightRule,
  type TemplateDesign,
} from '../templates';
import { Toggle } from './ribbon';

// The task pane, after Office's Format pane: everything that needs more room
// than the ribbon — a block's size, look and show-if condition, and the
// template's rules (which exams, highlights, what shows, column order, wording).

export type PaneMode = 'format' | 'exams' | 'highlights' | 'show' | 'columns' | 'wording';

export const PANE_TITLE: Record<PaneMode, string> = {
  format: 'Format',
  exams: 'Exam columns',
  highlights: 'Highlight rules',
  show: 'Show / hide parts',
  columns: 'Column order',
  wording: 'Wording',
};

const input = 'w-full h-7 rounded border border-border-strong bg-white px-2 text-[12px]';
const fieldLabel = 'block text-[11px] text-text-muted mb-0.5';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-3 mb-3 last:border-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-faint mb-2">{title}</p>
      {children}
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={`${input} tabular-nums`}
      />
    </label>
  );
}

function Colour({ label, value, onChange, allowAccent = true }: { label: string; value: string; onChange: (v: string) => void; allowAccent?: boolean }) {
  return (
    <div>
      <span className={fieldLabel}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2E77AE'}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 rounded border border-border-strong p-0"
          aria-label={label}
        />
        {allowAccent && (
          <label className="flex items-center gap-1 text-[11px] text-text-secondary">
            <input type="checkbox" checked={value === 'accent'} onChange={(e) => onChange(e.target.checked ? 'accent' : '#1F2937')} />
            Template colour
          </label>
        )}
      </div>
    </div>
  );
}

function DataSelect({ value, onChange, numericOnly }: { value: DataKey; onChange: (k: DataKey) => void; numericOnly?: boolean }) {
  const groups = [...new Set(DATA_FIELDS.map((f) => f.group))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DataKey)} className={input}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {DATA_FIELDS.filter((f) => f.group === g && (!numericOnly || f.numeric)).map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** "Show this block only if …" */
function ConditionEditor({ value, onChange }: { value: Condition | undefined; onChange: (c: Condition | undefined) => void }) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ field: 'learner.average', op: '>=', value: '80' })}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-700"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden /> Add a condition
      </button>
    );
  }
  const numeric = DATA_FIELD[value.field].numeric;
  const ops = CONDITION_OPS.filter((op) => numeric || op === '=' || op === '!=');
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-text-muted">Print this block only when</p>
      <DataSelect
        value={value.field}
        onChange={(field) => {
          const n = DATA_FIELD[field].numeric;
          onChange({ field, op: n ? value.op : value.op === '!=' ? '!=' : '=', value: n ? (Number.isFinite(Number(value.value)) ? value.value : '50') : '' });
        }}
      />
      <div className="flex gap-1.5">
        <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as Condition['op'] })} className={`${input} w-auto`}>
          {ops.map((op) => (
            <option key={op} value={op}>
              {OP_LABEL[op]}
            </option>
          ))}
        </select>
        <input
          value={value.value}
          maxLength={60}
          inputMode={numeric ? 'decimal' : 'text'}
          placeholder={numeric ? '80' : 'A'}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          className={input}
        />
      </div>
      <button type="button" onClick={() => onChange(undefined)} className="inline-flex items-center gap-1 text-[11px] text-error">
        <X className="w-3 h-3" aria-hidden /> Remove condition
      </button>
    </div>
  );
}

const ALIGNABLE = new Set(['schoolName', 'schoolDetails', 'examTitle', 'issuedDate', 'footerNote', 'text', 'field']);

function FormatPane({ block, onChange }: { block: CanvasBlock; onChange: (patch: Partial<CanvasBlock>, group?: string) => void }) {
  const p = block.props;
  const prop = (patch: CanvasBlock['props'], group?: string) => onChange({ props: { ...p, ...patch } }, group);
  const info = BLOCK_INFO[block.type];
  return (
    <>
      <Section title={info.label}>
        {info.hint && <p className="text-[11px] text-text-muted mb-2">{info.hint}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Num label="Left (mm)" value={block.x} onChange={(x) => onChange({ x: Math.min(Math.max(0, x), PAGE_MM.width - block.w) }, `x-${block.id}`)} />
          <Num label="Top (mm)" value={block.y} onChange={(y) => onChange({ y: Math.min(Math.max(0, y), PAGE_MM.height - block.h) }, `y-${block.id}`)} />
          <Num label="Width (mm)" value={block.w} min={2} onChange={(w) => onChange({ w: Math.max(2, Math.min(w, PAGE_MM.width - block.x)) }, `w-${block.id}`)} />
          <Num label="Height (mm)" value={block.h} min={0.5} step={0.5} onChange={(h) => onChange({ h: Math.max(0.5, Math.min(h, PAGE_MM.height - block.y)) }, `h-${block.id}`)} />
        </div>
      </Section>

      {block.type === 'text' && (
        <Section title="Text">
          <textarea
            value={String(p.text ?? '')}
            maxLength={600}
            rows={5}
            onChange={(e) => prop({ text: e.target.value }, `text-${block.id}`)}
            className="w-full rounded border border-border-strong px-2 py-1.5 text-[12px]"
          />
          <p className="text-[11px] text-text-muted mt-1">Insert data with Insert › Data field, or type a token:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {DATA_FIELDS.slice(0, 12).map((f) => (
              <button
                key={f.key}
                type="button"
                title={f.label}
                onClick={() => prop({ text: `${String(p.text ?? '')}{${f.key}}` })}
                className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-700 hover:bg-primary-100"
              >
                {`{${f.key}}`}
              </button>
            ))}
          </div>
        </Section>
      )}

      {block.type === 'field' && (
        <Section title="Data">
          <div className="space-y-2">
            <label className="block">
              <span className={fieldLabel}>Shows</span>
              <DataSelect value={String(p.binding ?? 'learner.name') as DataKey} onChange={(binding) => prop({ binding, label: DATA_FIELD[binding].label.replace(/ \(.*\)$/, '') })} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Label</span>
              <input value={String(p.label ?? '')} maxLength={60} onChange={(e) => prop({ label: e.target.value }, `label-${block.id}`)} className={input} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Label position</span>
              <select value={String(p.labelPosition ?? 'left')} onChange={(e) => prop({ labelPosition: e.target.value })} className={input}>
                <option value="left">Before the value</option>
                <option value="above">Above the value</option>
                <option value="none">No label</option>
              </select>
            </label>
          </div>
        </Section>
      )}

      {(block.type === 'text' || block.type === 'field' || block.type === 'schoolName') && (
        <Section title="Font">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Size (pt)" value={Number(p.size ?? 11)} min={6} max={48} onChange={(size) => prop({ size: Math.min(48, Math.max(6, size)) }, `size-${block.id}`)} />
            {block.type !== 'schoolName' && <Colour label="Colour" value={String(p.color ?? '#1F2937')} onChange={(color) => prop({ color }, `color-${block.id}`)} />}
          </div>
        </Section>
      )}

      {block.type === 'line' && (
        <Section title="Line">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Thickness (px)" value={Number(p.thickness ?? 1)} min={0.5} max={6} step={0.5} onChange={(thickness) => prop({ thickness }, `t-${block.id}`)} />
            <Colour label="Colour" value={String(p.color ?? 'accent')} onChange={(color) => prop({ color }, `c-${block.id}`)} />
          </div>
        </Section>
      )}

      {block.type === 'box' && (
        <Section title="Box">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Border (px)" value={Number(p.thickness ?? 1)} min={0} max={6} onChange={(thickness) => prop({ thickness }, `t-${block.id}`)} />
            <Num label="Rounding (mm)" value={Number(p.radius ?? 0)} min={0} max={20} onChange={(radius) => prop({ radius }, `r-${block.id}`)} />
            <Colour label="Border colour" value={String(p.color ?? 'accent')} onChange={(color) => prop({ color }, `c-${block.id}`)} />
            <div>
              <Colour label="Fill" value={String(p.fill || '#ffffff')} onChange={(fill) => prop({ fill }, `f-${block.id}`)} allowAccent={false} />
              {p.fill ? (
                <button type="button" onClick={() => prop({ fill: '' })} className="text-[11px] text-primary-700 underline">
                  No fill
                </button>
              ) : null}
            </div>
          </div>
        </Section>
      )}

      {ALIGNABLE.has(block.type) && (
        <Section title="Alignment">
          <div className="inline-flex rounded border border-border-strong overflow-hidden">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => prop({ align: a })}
                className={`px-2.5 h-7 text-[12px] capitalize ${(p.align ?? 'left') === a ? 'bg-primary-700 text-white' : 'text-primary-900'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Show if">
        <ConditionEditor value={block.showIf} onChange={(showIf) => onChange({ showIf }, `if-${block.id}`)} />
      </Section>
    </>
  );
}

export function TaskPane({
  mode,
  section,
  kind,
  design,
  block,
  onBlock,
  onDesign,
  showPositions,
  onShowPositions,
  onClose,
}: {
  mode: PaneMode;
  section: SchoolSection;
  kind: 'styled' | 'canvas';
  design: TemplateDesign;
  block: CanvasBlock | null;
  onBlock: (patch: Partial<CanvasBlock>, group?: string) => void;
  onDesign: (design: TemplateDesign, group?: string) => void;
  showPositions: boolean;
  onShowPositions: (v: boolean) => void;
  onClose: () => void;
}) {
  const fields: ReportCardFields = { ...defaultReportCardFields(section), ...design.fields };
  const rules = design.rules;
  const setRules = (patch: Partial<TemplateDesign['rules']>, group?: string) => onDesign({ ...design, rules: { ...rules, ...patch } }, group);
  const setExams = (patch: Partial<TemplateDesign['rules']['exams']>, group?: string) => setRules({ exams: { ...rules.exams, ...patch } }, group);
  const setHighlight = (i: number, patch: Partial<HighlightRule>, group?: string) =>
    setRules({ highlights: rules.highlights.map((h, j) => (j === i ? { ...h, ...patch } : h)) }, group);
  const examCodes = rules.exams.mode === 'term' ? ['BOT', 'MID', 'EOT'] : rules.exams.codes;

  let body: React.ReactNode;
  if (mode === 'format') {
    body =
      kind === 'styled' ? (
        <p className="text-[12px] text-text-muted">
          This template flows top to bottom, so there are no blocks to place. Use the Design tab for colours, font, frame and table style, and
          the Rules tab for what it shows. To place every part yourself, start a new template from <strong>Page layout</strong>.
        </p>
      ) : block ? (
        <FormatPane block={block} onChange={onBlock} />
      ) : (
        <p className="text-[12px] text-text-muted">Select a block on the page to format it, or add one from the Insert tab.</p>
      );
  } else if (mode === 'exams') {
    body = (
      <>
        <Section title="Which exams the card shows">
          <div className="space-y-1.5 text-[12px] text-primary-900">
            {(
              [
                ['opened', 'Only the exam it is printed from'],
                ['term', 'Every exam in that term (BOT, MID, EOT …)'],
                ['codes', 'These exams of the term:'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="exam-mode"
                  checked={rules.exams.mode === value}
                  onChange={() => setExams({ mode: value, codes: value === 'codes' && rules.exams.codes.length === 0 ? ['BOT', 'MID', 'EOT'] : rules.exams.codes, combine: value === 'opened' ? false : rules.exams.combine })}
                  className="mt-0.5"
                />
                {label}
              </label>
            ))}
            {rules.exams.mode === 'codes' && (
              <div className="pl-5">
                <input
                  value={rules.exams.codes.join(', ')}
                  onChange={(e) =>
                    setExams(
                      { codes: e.target.value.split(/[,\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean).slice(0, 8) },
                      'exam-codes',
                    )
                  }
                  placeholder="BOT, MID, EOT"
                  className={input}
                />
                <p className="text-[11px] text-text-muted mt-0.5">Exam codes, as set up under Exams.</p>
              </div>
            )}
          </div>
        </Section>
        {rules.exams.mode !== 'opened' && (
          <Section title="How">
            <div className="space-y-1.5 text-[12px] text-primary-900">
              <label className="flex items-start gap-2">
                <input type="radio" name="exam-combine" checked={!rules.exams.combine} onChange={() => setExams({ combine: false })} className="mt-0.5" />
                Side by side — a column per exam
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="exam-combine" checked={rules.exams.combine} onChange={() => setExams({ combine: true })} className="mt-0.5" />
                Combined into one final mark
              </label>
            </div>
            {rules.exams.combine && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] text-text-muted">Share of the final mark (any numbers; 20 / 30 / 50 works like percentages)</p>
                {examCodes.map((code) => (
                  <label key={code} className="flex items-center gap-2 text-[12px]">
                    <span className="w-12 font-semibold">{code}</span>
                    <input
                      type="number"
                      min={0}
                      value={rules.exams.weights[code] ?? 1}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 0) setExams({ weights: { ...rules.exams.weights, [code]: n } }, `w-${code}`);
                      }}
                      className={`${input} w-20`}
                    />
                  </label>
                ))}
              </div>
            )}
          </Section>
        )}
        <p className="text-[11px] text-text-muted">
          Report Card Studio uses this when its report type is <em>As the template sets</em>. Choosing another type there overrides it.
        </p>
      </>
    );
  } else if (mode === 'highlights') {
    body = (
      <>
        <p className="text-[11px] text-text-muted mb-2">Style a score or grade in the results table when it meets a rule. The first rule that matches wins.</p>
        {rules.highlights.map((h, i) => (
          <div key={i} className="rounded border border-border p-2 mb-2 space-y-1.5">
            <div className="flex gap-1.5">
              <select
                value={h.target}
                onChange={(e) => {
                  const target = e.target.value as HighlightRule['target'];
                  setHighlight(i, target === 'grade' ? { target, op: '=', value: 'E' } : { target, op: '<', value: '40' });
                }}
                className={`${input} w-auto`}
              >
                <option value="score">Score</option>
                <option value="grade">Grade</option>
              </select>
              <select value={h.op} onChange={(e) => setHighlight(i, { op: e.target.value as HighlightRule['op'] })} className={`${input} w-auto`}>
                {CONDITION_OPS.filter((op) => h.target === 'score' || op === '=' || op === '!=').map((op) => (
                  <option key={op} value={op}>
                    {OP_LABEL[op]}
                  </option>
                ))}
              </select>
              <input value={h.value} maxLength={20} onChange={(e) => setHighlight(i, { value: e.target.value }, `hv-${i}`)} className={`${input} w-16`} />
              <button type="button" onClick={() => setRules({ highlights: rules.highlights.filter((_, j) => j !== i) })} aria-label="Remove rule" className="text-text-muted hover:text-error">
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1">
                Text
                <input type="color" value={h.color || '#C0392B'} onChange={(e) => setHighlight(i, { color: e.target.value }, `hc-${i}`)} className="h-6 w-7 rounded border border-border-strong p-0" />
              </label>
              <label className="flex items-center gap-1">
                Fill
                <input type="color" value={h.fill || '#FFFFFF'} onChange={(e) => setHighlight(i, { fill: e.target.value }, `hf-${i}`)} className="h-6 w-7 rounded border border-border-strong p-0" />
              </label>
              {h.fill && (
                <button type="button" onClick={() => setHighlight(i, { fill: '' })} className="text-primary-700 underline">
                  no fill
                </button>
              )}
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={h.bold} onChange={(e) => setHighlight(i, { bold: e.target.checked })} /> Bold
              </label>
            </div>
          </div>
        ))}
        {rules.highlights.length < 12 && (
          <button
            type="button"
            onClick={() => setRules({ highlights: [...rules.highlights, { target: 'score', op: '<', value: '40', color: '#C0392B', fill: '', bold: true }] })}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-700"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Add a rule
          </button>
        )}
      </>
    );
  } else if (mode === 'show') {
    const groups = REPORT_CARD_FIELD_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => f.sections.includes(section)) })).filter((g) => g.fields.length > 0);
    body = (
      <>
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            <ul className="space-y-2">
              {g.fields.map((f) => (
                <li key={f.key} className="flex items-start justify-between gap-2">
                  <span className="text-[12px] text-primary-900">
                    {f.label}
                    {f.hint && <span className="block text-[11px] text-text-muted">{f.hint}</span>}
                  </span>
                  <Toggle label={f.label} checked={fields[f.key]} onChange={(v) => onDesign({ ...design, fields: { ...design.fields, [f.key]: v } })} />
                </li>
              ))}
              {g.title === 'Learner details' && (
                <li className="flex items-start justify-between gap-2">
                  <span className="text-[12px] text-primary-900">
                    Position in class
                    <span className="block text-[11px] text-text-muted">Saved straight away, for every template in this section.</span>
                  </span>
                  <Toggle label="Position in class" checked={showPositions} onChange={onShowPositions} />
                </li>
              )}
            </ul>
          </Section>
        ))}
      </>
    );
  } else if (mode === 'columns') {
    const move = (i: number, by: number) => {
      const columns = [...design.columns];
      const j = i + by;
      if (j < 0 || j >= columns.length) return;
      [columns[i], columns[j]] = [columns[j], columns[i]];
      onDesign({ ...design, columns });
    };
    const on = (key: ColumnKey) =>
      key === 'subject' || key === 'scores' || (key === 'points' ? section === 'PRIMARY' && fields.points : !!fields[key as keyof ReportCardFields]);
    body = (
      <>
        <p className="text-[11px] text-text-muted mb-2">The results table&apos;s columns, left to right. Switch columns on or off under Show / hide parts.</p>
        <ul className="rounded border border-border divide-y divide-border">
          {design.columns.map((key, i) => (
            <li key={key} className={`flex items-center px-2 py-1 text-[12px] ${on(key) ? 'text-primary-900' : 'text-text-faint'}`}>
              <span className="flex-1">{COLUMN_LABEL[key]}</span>
              {!on(key) && <span className="mr-2 text-[10px]">off</span>}
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${COLUMN_LABEL[key]} left`} className="p-0.5 disabled:opacity-30">
                <ChevronUp className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === design.columns.length - 1} aria-label={`Move ${COLUMN_LABEL[key]} right`} className="p-0.5 disabled:opacity-30">
                <ChevronDown className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  } else {
    const sigs = design.text.signatures;
    const setText = (patch: Partial<TemplateDesign['text']>, group?: string) => onDesign({ ...design, text: { ...design.text, ...patch } }, group);
    body = (
      <>
        <Section title="Title badge">
          <input value={design.text.title} maxLength={40} placeholder="Report Card (empty hides it)" onChange={(e) => setText({ title: e.target.value }, 'title')} className={input} />
        </Section>
        <Section title="Signature lines">
          <div className="space-y-1.5">
            {sigs.map((s, i) => (
              <div key={i} className="flex gap-1.5">
                <input value={s} maxLength={60} onChange={(e) => setText({ signatures: sigs.map((x, j) => (j === i ? e.target.value : x)) }, `sig-${i}`)} className={input} />
                <button type="button" onClick={() => setText({ signatures: sigs.filter((_, j) => j !== i) })} aria-label="Remove signature line" className="text-text-muted hover:text-error">
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            ))}
            {sigs.length < 4 && (
              <button type="button" onClick={() => setText({ signatures: [...sigs, 'Signature'] })} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-700">
                <Plus className="w-3.5 h-3.5" aria-hidden /> Add a signature line
              </button>
            )}
          </div>
        </Section>
        <Section title="Footer note">
          <textarea
            value={design.text.footerNote}
            maxLength={300}
            rows={4}
            placeholder="e.g. Next term begins on 2 February. Fees must be cleared before reporting."
            onChange={(e) => setText({ footerNote: e.target.value }, 'footer')}
            className="w-full rounded border border-border-strong px-2 py-1.5 text-[12px]"
          />
        </Section>
      </>
    );
  }

  return (
    <aside className="w-[300px] shrink-0 border-l border-border bg-white flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border">
        <p className="text-[13px] font-bold text-primary-900">{PANE_TITLE[mode]}</p>
        <button type="button" onClick={onClose} aria-label="Close pane" className="text-text-muted hover:text-primary-900">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{body}</div>
    </aside>
  );
}
