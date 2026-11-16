import type { CSSProperties } from 'react';
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
  'line',
  'box',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type BlockProps = Record<string, string | number | boolean>;
export interface CanvasBlock {
  id: string;
  type: BlockType;
  /** Millimetres on an A4 page. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: BlockProps;
}

export interface TemplateDesign {
  base: string;
  fields: Partial<ReportCardFields>;
  columns: ColumnKey[];
  style: TemplateStyle;
  text: TemplateText;
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

export const FONT_LABEL: Record<TemplateStyle['font'], string> = {
  rounded: 'Rounded (Quicksand)',
  plain: 'Plain (Arial)',
  serif: 'Serif (Georgia)',
};
const FONT_FAMILY: Record<TemplateStyle['font'], string> = {
  rounded: "var(--font-sans), 'Quicksand', sans-serif",
  plain: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
};

export const ACCENT_SWATCHES = ['#2E77AE', '#1E3A5F', '#0F766E', '#15803D', '#7A1F2B', '#B45309', '#6D28D9', '#111827'];

/** The card's colours and font. The sheet is built from the app's theme
 * colours, so overriding them here recolours every part of it. */
export function templateVars(style: TemplateStyle): CSSProperties {
  const a = style.accent;
  return {
    '--color-primary-700': a,
    '--color-primary-800': `color-mix(in srgb, ${a} 85%, black)`,
    '--color-primary-900': `color-mix(in srgb, ${a} 55%, black)`,
    '--color-primary-50': `color-mix(in srgb, ${a} 8%, white)`,
    '--rc-highlight': style.highlight,
    fontFamily: FONT_FAMILY[style.font],
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
  text: { label: 'Text', hint: 'Your own words. Use {student}, {class}, {term} …', w: 80, h: 8 },
  line: { label: 'Line', hint: '', w: 186, h: 1 },
  box: { label: 'Box', hint: 'A border or shaded panel behind other blocks.', w: 60, h: 30 },
};

/** The words a text block can fill in, e.g. "Dear parent of {student}". */
export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{school}', label: 'School name' },
  { token: '{student}', label: "Learner's name" },
  { token: '{class}', label: 'Class and stream' },
  { token: '{id}', label: 'Student ID' },
  { token: '{position}', label: 'Position, e.g. 7 of 39' },
  { token: '{average}', label: 'Average' },
  { token: '{grade}', label: 'Overall grade' },
  { token: '{exam}', label: 'Exam name' },
  { token: '{term}', label: 'Term' },
  { token: '{date}', label: 'Date issued' },
];

export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

let counter = 0;
export function newBlockId(type: BlockType): string {
  counter += 1;
  return `${type}-${Date.now().toString(36)}${counter}`;
}
