import type { CSSProperties } from 'react';
import type React from 'react';
import type { SchoolSection } from '@/lib/levels';
import type { ReportCardFields } from './ReportCardSheet';

// Report card templates — mirrors backend report-card-templates.repository.ts
// (the backend checks and cleans every design; these are the shapes it sends).

export type TemplateKind = 'styled' | 'canvas';

export const COLUMN_KEYS = [
  'rowNumbers',
  'subjectCode',
  'subject',
  'scores',
  'grade',
  'points',
  'subjectRemarks',
  'teacherInitials',
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  rowNumbers: '#',
  subjectCode: 'Code',
  subject: 'Subject',
  scores: 'Scores (BOT / MID / EOT)',
  grade: 'Grade',
  points: 'Points',
  subjectRemarks: 'Remarks',
  teacherInitials: 'Initials',
};

export interface TemplateStyle {
  accent: string;
  highlight: string;
  frame: 'double' | 'single' | 'none';
  font: 'rounded' | 'plain' | 'serif';
  density: 'comfortable' | 'compact';
  header: 'centered' | 'left';
  table: 'bordered' | 'striped' | 'minimal';
}
export interface TemplateText {
  title: string;
  signatures: string[];
  footerNote: string;
}

export const BLOCK_TYPES = [
  'header',
  'schoolName',
  'schoolDetails',
  'examTitle',
  'badge',
  'logo',
  'photo',
  'learner',
  'results',
  'summary',
  'remarks',
  'signatures',
  'issuedDate',
  'gradingKey',
  'footerNote',
  'text',
  'field',
  'line',
  'box',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type BlockProps = Record<string, string | number | boolean>;

// ─── Data a template can show ───────────────────────────────────────────────
// Mirrors DATA_KEYS in the backend. A "field" block shows one, a text block
// fills in {learner.name} and friends, and a show-if condition tests one.

export const DATA_FIELDS = [
  { key: 'learner.name', label: "Learner's name", group: 'Learner', numeric: false, sample: 'Nakato Sarah' },
  { key: 'learner.id', label: 'Student ID', group: 'Learner', numeric: false, sample: 'S262214' },
  { key: 'learner.class', label: 'Class and stream', group: 'Learner', numeric: false, sample: 'Senior 1 Central' },
  { key: 'learner.stream', label: 'Stream', group: 'Learner', numeric: false, sample: 'Central' },
  { key: 'learner.position', label: 'Position', group: 'Results', numeric: true, sample: '7' },
  { key: 'learner.classSize', label: 'Class size', group: 'Results', numeric: true, sample: '94' },
  { key: 'learner.average', label: 'Average (%)', group: 'Results', numeric: true, sample: '68' },
  { key: 'learner.grade', label: 'Overall grade', group: 'Results', numeric: false, sample: 'C' },
  { key: 'learner.comment', label: "Overall grade's comment", group: 'Results', numeric: false, sample: 'Good' },
  { key: 'learner.aggregate', label: 'Aggregate (Primary)', group: 'Results', numeric: true, sample: '12' },
  { key: 'learner.division', label: 'Division (Primary)', group: 'Results', numeric: false, sample: 'Division 1' },
  { key: 'learner.attendance', label: 'Attendance', group: 'Results', numeric: false, sample: '58 / 62 days' },
  { key: 'learner.subjects', label: 'Number of subjects', group: 'Results', numeric: true, sample: '9' },
  { key: 'school.name', label: 'School name', group: 'School', numeric: false, sample: 'Central College' },
  { key: 'school.address', label: 'Address', group: 'School', numeric: false, sample: 'Kampala' },
  { key: 'school.emis', label: 'EMIS number', group: 'School', numeric: false, sample: '123456' },
  { key: 'exam.name', label: 'Exam name', group: 'Exam', numeric: false, sample: 'Mid-Term Exams' },
  { key: 'exam.term', label: 'Term', group: 'Exam', numeric: false, sample: 'Term 3' },
  { key: 'report.date', label: 'Date issued', group: 'Exam', numeric: false, sample: '17 November 2026' },
] as const;
export type DataKey = (typeof DATA_FIELDS)[number]['key'];
export const DATA_FIELD: Record<DataKey, (typeof DATA_FIELDS)[number]> = Object.fromEntries(
  DATA_FIELDS.map((f) => [f.key, f]),
) as Record<DataKey, (typeof DATA_FIELDS)[number]>;

export const CONDITION_OPS = ['<', '<=', '>', '>=', '=', '!='] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
export const OP_LABEL: Record<ConditionOp, string> = {
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
  '=': 'is',
  '!=': 'is not',
};
export interface Condition {
  field: DataKey;
  op: ConditionOp;
  value: string;
}

/** Whether `actual` meets `op value`. Numbers compare as numbers; text ignores case.
 * A missing value never meets a condition. */
export function compare(actual: string | number | null | undefined, op: ConditionOp, value: string): boolean {
  if (actual === null || actual === undefined || actual === '' || actual === '—') return false;
  const a = typeof actual === 'number' ? actual : Number(actual);
  const b = Number(value);
  if (Number.isFinite(a) && Number.isFinite(b) && value.trim() !== '') {
    switch (op) {
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '=': return a === b;
      case '!=': return a !== b;
    }
  }
  const same = String(actual).trim().toLowerCase() === value.trim().toLowerCase();
  return op === '=' ? same : op === '!=' ? !same : false;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface ExamRule {
  mode: 'opened' | 'term' | 'codes';
  codes: string[];
  combine: boolean;
  weights: Record<string, number>;
}
export interface HighlightRule {
  target: 'score' | 'grade';
  op: ConditionOp;
  value: string;
  color: string;
  fill: string;
  bold: boolean;
}
export interface TemplateRules {
  exams: ExamRule;
  highlights: HighlightRule[];
}
export const DEFAULT_RULES: TemplateRules = {
  exams: { mode: 'opened', codes: [], combine: false, weights: {} },
  highlights: [],
};

/** The look a score or grade cell takes from the first highlight rule it meets. */
export function highlightFor(rules: HighlightRule[] | undefined, target: HighlightRule['target'], value: string | number | null): React.CSSProperties | undefined {
  const rule = rules?.find((r) => r.target === target && compare(value, r.op, r.value));
  if (!rule) return undefined;
  return {
    ...(rule.color ? { color: rule.color } : {}),
    ...(rule.fill ? { background: rule.fill } : {}),
    ...(rule.bold ? { fontWeight: 800 } : {}),
  };
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  /** Millimetres on an A4 page. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: BlockProps;
  showIf?: Condition;
}

export interface TemplateDesign {
  base: string;
  fields: Partial<ReportCardFields>;
  columns: ColumnKey[];
  style: TemplateStyle;
  text: TemplateText;
  rules: TemplateRules;
  blocks?: CanvasBlock[];
}

export interface ReportCardTemplate {
  id: string;
  name: string;
  description: string | null;
  section: SchoolSection;
  kind: TemplateKind;
  builtIn: boolean;
  design: TemplateDesign;
  updatedAt: string | null;
}
export interface TemplateListing {
  section: SchoolSection;
  defaultId: string;
  templates: ReportCardTemplate[];
}

export const PAGE_MM = { width: 210, height: 297 } as const;
/** CSS px per mm at 96dpi — what the browser (and the PDF) prints at. */
export const PX_PER_MM = 96 / 25.4;

/** Every report card prints in Times New Roman, whatever font a saved
 * template still carries in `style.font`. */
const REPORT_FONT = "'Times New Roman', Times, serif";

export const ACCENT_SWATCHES = ['#2E77AE', '#1E3A5F', '#0F766E', '#15803D', '#7A1F2B', '#B45309', '#6D28D9', '#111827'];

/** The card's font. Its colours are the school's theme colour (set by
 * SchoolThemeApplier on the page), never the template's own `accent` /
 * `highlight`, so every report follows the colour the school chose. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function templateVars(_style: TemplateStyle): CSSProperties {
  return {
    '--rc-highlight': 'var(--color-primary-700)',
    fontFamily: REPORT_FONT,
  } as CSSProperties;
}

export interface BlockInfo {
  label: string;
  hint: string;
  /** Default size in mm when added. */
  w: number;
  h: number;
  /** Only one makes sense on a page. */
  single?: boolean;
}
export const BLOCK_INFO: Record<BlockType, BlockInfo> = {
  header: { label: 'Full header', hint: 'Badge, school name, address, exam and photo together.', w: 186, h: 34, single: true },
  schoolName: { label: 'School name', hint: '', w: 130, h: 10 },
  schoolDetails: { label: 'Address & EMIS', hint: '', w: 130, h: 8 },
  examTitle: { label: 'Exam & term', hint: '', w: 130, h: 6 },
  badge: { label: 'Title badge', hint: 'The "Report Card" pill — wording under Style.', w: 40, h: 6 },
  logo: { label: 'School badge', hint: '', w: 24, h: 24 },
  photo: { label: "Learner's photo", hint: '', w: 22, h: 28 },
  learner: { label: 'Learner details', hint: 'Name, class, ID and position.', w: 186, h: 16 },
  results: { label: 'Results table', hint: 'Grows with the subject list; anything below moves down.', w: 186, h: 110, single: true },
  summary: { label: 'Average & grade', hint: '', w: 186, h: 14 },
  remarks: { label: 'Remarks box', hint: '', w: 186, h: 18 },
  signatures: { label: 'Signature lines', hint: 'Labels under Style.', w: 186, h: 14 },
  issuedDate: { label: 'Date issued', hint: '', w: 90, h: 5 },
  gradingKey: { label: 'Grading key', hint: '', w: 186, h: 20 },
  footerNote: { label: 'Footer note', hint: 'The note written under Style.', w: 186, h: 8 },
  text: { label: 'Text box', hint: 'Your own words. Insert data like {learner.name} or {learner.average}.', w: 80, h: 8 },
  field: { label: 'Data field', hint: 'One piece of real data — position, average, attendance … — with a label.', w: 60, h: 7 },
  line: { label: 'Line', hint: '', w: 186, h: 1 },
  box: { label: 'Box', hint: 'A border or shaded panel behind other blocks.', w: 60, h: 30 },
};

/** Fills {learner.name}-style tokens (and the older {student}, {class}, …). */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([\w.]+)\}/g, (match, key: string) => values[key] ?? match);
}

let counter = 0;
export function newBlockId(type: BlockType): string {
  counter += 1;
  return `${type}-${Date.now().toString(36)}${counter}`;
}
