'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { SchoolLevel, SchoolSection, SubjectPhase } from '@/lib/levels';
import {
  COLUMN_KEYS,
  PAGE_MM,
  PX_PER_MM,
  fillPlaceholders,
  templateVars,
  type CanvasBlock,
  type ColumnKey,
  type ReportCardTemplate,
  type TemplateDesign,
  type TemplateStyle,
} from './templates';

// One learner's printed report card — used by the report-cards print page
// (and its server-side PDF) and by Report Card Templates' live preview, so what
// a school sees while choosing its layout is exactly what prints.

type SubjectRole = 'principal' | 'subsidiary';

export interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
  /** The short name to print: the standard UCE name ("English", "CRE",
   * "Maths") for the subject's code, else the full name. */
  subjectReportName?: string;
  /** UNEB paper code (553, P530) when the catalog has one. */
  paperCode?: string | null;
  role: SubjectRole;
  hasVariant: boolean;
  variantScores?: { name: string; rawScore: number | null; isAbsent: boolean }[];
  /** Percentage (0–100) — what grades and averages use. */
  rawScore: number | null;
  /** As entered, out of maxMark (e.g. 38 of 50); null for a multi-paper subject. */
  mark: number | null;
  maxMark: number;
  isAbsent: boolean;
  computedGrade: string | null;
  /** Primary: counts toward the PLE aggregate. */
  isExaminable: boolean;
  /** Primary: the band's points (D1 = 1 … F9 = 9). */
  points: number | null;
  /** The subject teacher's initials ("J.O."), or null if nobody is assigned. */
  teacherInitials?: string | null;
  /** Scores in the report's `compared` exams, same order. */
  history?: { examId: string; rawScore: number | null; isAbsent: boolean }[];
}
export interface ReportCardStudent {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  streamId: string | null;
  streamName: string | null;
  photoUrl: string | null;
  /** Days present (or late) of the days a register was taken this term. */
  attendance: { present: number; total: number } | null;
  average: number | null;
  overallGrade: string | null;
  overallComment: string | null;
  principalAverage: number | null;
  principalGrade: string | null;
  principalComment: string | null;
  subsidiaryAverage: number | null;
  subsidiaryGrade: string | null;
  subsidiaryComment: string | null;
  aggregate: number | null;
  division: string | null;
  rank: number | null;
  subjects: ReportCardStudentSubject[];
}
export interface GradeDivision {
  label: string;
  minAggregate: number;
  maxAggregate: number;
}
export interface ComparedExam {
  id: string;
  label: string;
  /** Side-by-side: the exam the report was opened from, in date order. */
  isCurrent?: boolean;
  name: string;
  weightPercent: number | null;
}
export interface ExamReportCard {
  mode?: 'single' | 'side_by_side' | 'combined';
  /** Extra columns on the report, oldest exam first. */
  compared?: ComparedExam[];
  /** Every subject taught in this class in this exam, for any stream. */
  classSubjects?: { subjectId: string; subjectName: string; subjectShortName: string; role: 'principal' | 'subsidiary' }[];
  exam: { id: string; name: string; label?: string; termId: string; termName: string; publishedAt: string | null };
  /** The school's choice, per section, whether report cards show positions. */
  showPositions: boolean;
  /** The school's choice, per section, of what else report cards show. */
  reportCardFields: ReportCardFields;
  /** The template this report prints with (chosen, or the section's default). */
  template?: ReportCardTemplate;
  class: { id: string; name: string; phase: SchoolLevel };
  stream: { id: string; name: string } | null;
  aggregation: { subjectCount: number; divisions: GradeDivision[] } | null;
  students: ReportCardStudent[];
}
export interface SchoolInfo {
  name: string;
  district: string | null;
  address: string | null;
  logoUrl: string | null;
  /** Per section — a report card prints its own section's EMIS number. */
  emisCodes?: Partial<Record<string, string>>;
  sectionSettings?: { section: string; assessmentStyle: string | null }[];
}
/** A Nursery pupil's progress ratings for the exam's term ("both" mode). */
export interface NurseryRatings {
  areas: { id: string; name: string }[];
  ratings: Record<string, { rating: string | null; comment: string | null }>;
}
export interface GradeBand {
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  comment: string;
}
export interface SchoolGradingSchemeSelection {
  appliesTo: SubjectPhase;
  roleScope: 'any' | 'principal' | 'subsidiary';
  scheme: { bands: GradeBand[] };
}

// ─── What a report card can show ────────────────────────────────────────────
// Mirrors REPORT_CARD_FIELDS in the backend's section-settings.repository.ts
// (defaults, and which sections each applies to).

export type ReportCardField =
  | 'schoolLogo'
  | 'schoolAddress'
  | 'emisNumber'
  | 'studentPhoto'
  | 'studentId'
  | 'rowNumbers'
  | 'subjectCode'
  | 'shortSubjectNames'
  | 'score'
  | 'grade'
  | 'points'
  | 'subjectRemarks'
  | 'teacherInitials'
  | 'paperBreakdown'
  | 'otherSubjects'
  | 'totalMarks'
  | 'average'
  | 'overallGrade'
  | 'aggregate'
  | 'division'
  | 'attendance'
  | 'progressRatings'
  | 'remarks'
  | 'signatures'
  | 'issuedDate'
  | 'gradingKey';
export type ReportCardFields = Record<ReportCardField, boolean>;

const ALL: SchoolSection[] = ['KINDERGARTEN', 'PRIMARY', 'SECONDARY'];

export const REPORT_CARD_FIELD_GROUPS: {
  title: string;
  fields: { key: ReportCardField; label: string; hint?: string; sections: SchoolSection[]; default: boolean }[];
}[] = [
  {
    title: 'Header',
    fields: [
      { key: 'schoolLogo', label: 'School badge', sections: ALL, default: true },
      { key: 'schoolAddress', label: 'Address and district', sections: ALL, default: true },
      { key: 'emisNumber', label: 'EMIS number', sections: ALL, default: true },
      {
        key: 'studentPhoto',
        label: "Learner's photo",
        hint: "From the learner's profile. Initials show until a photo is added.",
        sections: ALL,
        default: true,
      },
    ],
  },
  {
    title: 'Learner details',
    fields: [{ key: 'studentId', label: 'Student ID', sections: ALL, default: true }],
  },
  {
    title: 'Results table',
    fields: [
      { key: 'rowNumbers', label: 'Row numbers (#)', sections: ALL, default: true },
      {
        key: 'subjectCode',
        label: 'Paper code',
        hint: 'The UNEB code (553 Biology, P530 Biology), where the subject has one.',
        sections: ['SECONDARY'],
        default: true,
      },
      {
        key: 'shortSubjectNames',
        label: 'Short subject names',
        hint: 'English, CRE, Maths, ICT… (the standard UCE names) in place of the full names, leaving more room for marks.',
        sections: ['SECONDARY'],
        default: true,
      },
      { key: 'score', label: 'Score', sections: ALL, default: true },
      { key: 'grade', label: 'Grade', sections: ALL, default: true },
      { key: 'points', label: 'Points (D1 = 1 … F9 = 9)', sections: ['PRIMARY'], default: true },
      { key: 'subjectRemarks', label: 'Remark per subject', sections: ALL, default: true },
      {
        key: 'teacherInitials',
        label: "Subject teacher's initials",
        hint: 'From who is assigned to teach each subject on the Subjects page.',
        sections: ALL,
        default: true,
      },
      { key: 'paperBreakdown', label: 'Paper-by-paper scores', hint: 'For subjects with more than one paper.', sections: ['SECONDARY'], default: true },
      { key: 'otherSubjects', label: 'Non-PLE subjects', hint: 'Luganda, CRE, PE, Creative Arts, …', sections: ['PRIMARY'], default: true },
    ],
  },
  {
    title: 'Summary',
    fields: [
      { key: 'totalMarks', label: 'Total marks', sections: ['PRIMARY'], default: true },
      { key: 'average', label: 'Average', sections: ALL, default: true },
      { key: 'overallGrade', label: 'Overall grade', sections: ['KINDERGARTEN', 'SECONDARY'], default: true },
      { key: 'aggregate', label: 'Aggregate', sections: ['PRIMARY'], default: true },
      { key: 'division', label: 'Division', sections: ['PRIMARY'], default: true },
      {
        key: 'attendance',
        label: 'Attendance',
        hint: "Days present this term, from the daily register.",
        sections: ALL,
        default: false,
      },
      { key: 'progressRatings', label: 'Progress ratings', hint: 'When the Nursery gives both marks and ratings.', sections: ['KINDERGARTEN'], default: true },
    ],
  },
  {
    title: 'Footer',
    fields: [
      { key: 'remarks', label: 'Remarks box', sections: ALL, default: true },
      { key: 'signatures', label: 'Signature lines', sections: ALL, default: true },
      { key: 'issuedDate', label: 'Date issued', sections: ALL, default: true },
      { key: 'gradingKey', label: 'Grading key', sections: ALL, default: true },
    ],
  },
];

/** The defaults for a section — what report cards showed before a school chose. */
export function defaultReportCardFields(section: SchoolSection): ReportCardFields {
  const out = {} as ReportCardFields;
  for (const group of REPORT_CARD_FIELD_GROUPS) {
    for (const f of group.fields) out[f.key] = f.sections.includes(section) && f.default;
  }
  return out;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const GRADE_CHIP: Record<string, string> = {
  A: 'bg-success-bg text-success',
  B: 'bg-primary-50 text-primary-700',
  C: 'bg-accent-light text-accent-dark',
  D: 'bg-warning-bg text-warning',
  E: 'bg-warning-bg text-warning',
  F: 'bg-error-bg text-error',
  Pass: 'bg-success-bg text-success',
  Fail: 'bg-error-bg text-error',
  // PLE (D1–F9) — keyed by the grade's first letter via gradeChip() below.
};

function gradeChip(grade: string): string {
  return GRADE_CHIP[grade] ?? PLE_CHIP[grade[0]] ?? 'bg-bg-muted text-text-muted';
}
const PLE_CHIP: Record<string, string> = {
  D: 'bg-success-bg text-success',
  C: 'bg-primary-50 text-primary-700',
  P: 'bg-warning-bg text-warning',
  F: 'bg-error-bg text-error',
};

/** The grade to print: the one frozen at publish, else the live band. */
function gradeOf(s: ReportCardStudentSubject, bands: GradeBand[]): string | null {
  if (s.computedGrade) return s.computedGrade;
  if (s.isAbsent || s.rawScore === null) return null;
  return bands.find((b) => s.rawScore! >= b.minPct && s.rawScore! <= b.maxPct)?.label ?? null;
}

function round(n: number): number {
  return Math.round(n);
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
}

export interface Sheet {
  student: ReportCardStudent;
  exam: ExamReportCard['exam'];
  klass: ExamReportCard['class'];
  stream: ExamReportCard['stream'];
  aggregation: ExamReportCard['aggregation'];
  totalInClass: number;
  showPositions: boolean;
  fields: ReportCardFields;
  nurseryRatings: NurseryRatings | null;
  mode?: ExamReportCard['mode'];
  compared?: ComparedExam[];
  /** The look to print with; Classic when absent. */
  template?: ReportCardTemplate | null;
}

// Classic, for a card printed without a template (older callers, previews).
export const CLASSIC_DESIGN: TemplateDesign = {
  base: 'classic',
  fields: {},
  columns: [...COLUMN_KEYS],
  style: {
    accent: '#2E77AE',
    highlight: '#FF8E2B',
    frame: 'double',
    font: 'rounded',
    density: 'comfortable',
    header: 'centered',
    table: 'bordered',
  },
  text: {
    title: 'Report Card',
    signatures: ["Class Teacher's Signature", "Parent/Guardian's Signature", "Head Teacher's Signature"],
    footerNote: '',
  },
};

interface TableLook {
  columns: ColumnKey[];
  density: TemplateStyle['density'];
  table: TemplateStyle['table'];
}
const CLASSIC_LOOK: TableLook = { columns: [...COLUMN_KEYS], density: 'comfortable', table: 'bordered' };

function ReportSubjectTable({
  title,
  subjects,
  fields,
  bands = [],
  showPoints = false,
  compared = [],
  combined = false,
  examLabel,
  look = CLASSIC_LOOK,
}: {
  title: string;
  subjects: ReportCardStudentSubject[];
  fields: ReportCardFields;
  /** The level's grading bands: each subject's remark is its band's
   * comment, and they grade an unpublished exam live. */
  bands?: GradeBand[];
  showPoints?: boolean;
  compared?: ComparedExam[];
  combined?: boolean;
  /** The opened exam's short heading ("MID"), for the score column. */
  examLabel?: string;
  look?: TableLook;
}) {
  if (subjects.length === 0) return null;
  const compact = look.density === 'compact';
  const pad = compact ? 'py-0.5 px-1.5' : 'py-1 px-2';
  // Bordered: a grid. Striped: shaded rows, no inner verticals. Minimal: hairlines only.
  const vline = look.table === 'bordered' ? 'border-r border-border last:border-r-0' : '';
  const th = `${pad} ${vline} border-b ${look.table === 'minimal' ? 'border-primary-700' : 'border-border'}`;
  const td = `${pad} ${vline}`;
  // Side by side, the opened exam sits among the others in date order, so it
  // has no separate score column.
  const inline = compared.some((e) => e.isCurrent);
  const nameOf = (s: ReportCardStudentSubject) =>
    fields.shortSubjectNames && s.subjectReportName ? s.subjectReportName : s.subjectName;
  const scoreCell = (s: ReportCardStudentSubject) =>
    s.isAbsent ? (
      <span className="text-text-muted font-normal">Abs</span>
    ) : s.rawScore !== null ? (
      // Out of the subject's own full mark when it isn't 100.
      s.mark !== null && s.maxMark !== 100 ? `${round(s.mark)}/${s.maxMark}` : round(s.rawScore)
    ) : (
      '—'
    );

  type Column = { key: string; head: React.ReactNode; headClass?: string; cell: (s: ReportCardStudentSubject, i: number) => React.ReactNode; cellClass?: string };
  const columnsFor = (key: ColumnKey): Column[] => {
    switch (key) {
      case 'rowNumbers':
        return fields.rowNumbers
          ? [{ key, head: '#', headClass: 'w-8 text-center', cell: (_s, i) => i + 1, cellClass: 'text-center text-text-faint tabular-nums' }]
          : [];
      case 'subjectCode':
        return fields.subjectCode
          ? [{ key, head: 'Code', headClass: 'w-14', cell: (s) => s.paperCode ?? '', cellClass: 'tabular-nums text-text-secondary' }]
          : [];
      case 'subject':
        return [
          {
            key,
            head: 'Subject',
            cell: (s) => (
              <span title={s.subjectName}>
                {nameOf(s)}
                {fields.paperBreakdown && s.hasVariant && s.variantScores && (
                  <span className="block text-[10px] text-text-faint">
                    {s.variantScores
                      .map((v) => `${v.name} ${v.isAbsent ? 'Abs' : v.rawScore !== null ? round(v.rawScore) : '—'}`)
                      .join(' · ')}
                  </span>
                )}
              </span>
            ),
          },
        ];
      case 'scores': {
        const cols: Column[] = compared.map((exam) => ({
          key: `exam-${exam.id}`,
          head: (
            <span title={exam.name}>
              {exam.label}
              {exam.weightPercent !== null && ` (${exam.weightPercent}%)`}
            </span>
          ),
          headClass: 'text-right whitespace-nowrap',
          cellClass: `text-right tabular-nums ${exam.isCurrent ? 'font-semibold' : ''}`,
          cell: (s) => {
            if (exam.isCurrent) return scoreCell(s);
            const past = s.history?.find((h) => h.examId === exam.id);
            return past?.isAbsent ? 'Abs' : past?.rawScore != null ? round(past.rawScore) : '—';
          },
        }));
        if (fields.score && !inline) {
          cols.push({
            key: 'score',
            head: combined ? 'Final' : examLabel || (compared.length > 0 ? 'This exam' : 'Score'),
            headClass: 'text-right',
            cellClass: 'text-right tabular-nums font-semibold',
            cell: scoreCell,
          });
        }
        return cols;
      }
      case 'grade':
        return fields.grade
          ? [
              {
                key,
                head: 'Grade',
                headClass: 'text-center',
                cellClass: 'text-center',
                cell: (s) => {
                  const grade = gradeOf(s, bands);
                  return grade ? (
                    <span
                      className={`inline-flex min-w-6 justify-center px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${gradeChip(grade)}`}
                    >
                      {grade}
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  );
                },
              },
            ]
          : [];
      case 'points':
        return showPoints && fields.points
          ? [{ key, head: 'Points', headClass: 'text-center', cellClass: 'text-center tabular-nums font-semibold', cell: (s) => s.points ?? '—' }]
          : [];
      case 'subjectRemarks':
        return fields.subjectRemarks
          ? [
              {
                key,
                head: 'Remarks',
                cellClass: 'text-text-secondary',
                cell: (s) => bands.find((b) => b.label === gradeOf(s, bands))?.comment ?? ' ',
              },
            ]
          : [];
      case 'teacherInitials':
        return fields.teacherInitials
          ? [{ key, head: 'Initials', headClass: 'w-14 text-center', cellClass: 'text-center font-semibold text-text-secondary', cell: (s) => s.teacherInitials ?? ' ' }]
          : [];
    }
  };
  const columns = look.columns.flatMap(columnsFor);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">{title}</p>
      <table className={`w-full ${compact ? 'text-xs' : 'text-sm'} ${look.table === 'minimal' ? '' : 'border border-border'}`}>
        <thead>
          <tr
            className={`text-left text-[10.5px] font-bold uppercase tracking-wide ${
              look.table === 'minimal' ? 'text-primary-700' : 'bg-primary-50 text-text-faint'
            }`}
          >
            {columns.map((c) => (
              <th key={c.key} className={`${th} ${c.headClass ?? ''}`}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr
              key={s.subjectId}
              className={`border-b border-border last:border-0 ${look.table === 'striped' && i % 2 === 1 ? 'bg-bg-subtle' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${td} ${c.cellClass ?? ''}`}>
                  {c.cell(s, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RATING_LABEL: Record<string, string> = {
  emerging: 'Emerging',
  developing: 'Developing',
  proficient: 'Proficient',
};

function NurseryRatingsTable({ data }: { data: NurseryRatings }) {
  if (data.areas.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">Progress Ratings</p>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-bg-subtle text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
            <th className="py-1 px-2 border-b border-r border-border">Learning Area</th>
            <th className="py-1 px-2 border-b border-border w-32">Rating</th>
          </tr>
        </thead>
        <tbody>
          {data.areas.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <td className="py-1 px-2 border-r border-border">{a.name}</td>
              <td className="py-1 px-2 font-semibold text-primary-900">
                {RATING_LABEL[data.ratings[a.id]?.rating ?? ''] ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatRow({ items }: { items: ({ label: string; value: string } | false)[] }) {
  const shown = items.filter((it): it is { label: string; value: string } => !!it);
  if (shown.length === 0) return null;
  return (
    <table className="w-full border border-border text-sm">
      <thead>
        <tr className="bg-bg-subtle text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
          {shown.map((it) => (
            <th key={it.label} className="py-1 px-2 border-b border-r border-border last:border-r-0 text-center">
              {it.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {shown.map((it) => (
            <td
              key={it.label}
              className="py-1.5 px-2 border-r border-border last:border-r-0 text-center font-extrabold text-primary-900"
            >
              {it.value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function RemarksBox({ lines }: { lines: { label: string; text: string | null }[] }) {
  const content = lines.filter((l) => l.text);
  return (
    <div className="border border-border p-2 min-h-[2.5rem]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-faint mb-0.5">Remarks</p>
      {content.length === 0 ? (
        <p className="text-xs text-text-faint">—</p>
      ) : (
        content.map((l) => (
          <p key={l.label} className="text-xs text-text-secondary">
            <span className="font-semibold">{l.label}: </span>
            <span className="italic">&ldquo;{l.text}&rdquo;</span>
          </p>
        ))
      )}
    </div>
  );
}

function GradingLegend({ bands, divisions }: { bands: GradeBand[]; divisions?: GradeDivision[] }) {
  if (bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.minPct - a.minPct);
  return (
    <div className="mt-2 pt-1.5 border-t border-border">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0 text-[9px] leading-tight text-text-secondary">
        {sorted.map((b) => (
          <p key={b.label}>
            <span className="font-semibold text-text-muted">
              {round(b.minPct)}%–{round(b.maxPct)}%:
            </span>{' '}
            {b.label} Grade — {b.comment}
            {divisions && b.points !== null ? ` (${b.points} pt${b.points === 1 ? '' : 's'})` : ''}
          </p>
        ))}
      </div>
      {divisions && divisions.length > 0 && (
        <p className="mt-1 text-[9px] leading-tight text-text-secondary">
          <span className="font-semibold text-text-muted">Aggregates: </span>
          {divisions.map((d) => `${d.label} ${d.minAggregate}–${d.maxAggregate}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

/** The photo box: the learner's photo, or their initials until one is added. */
function LearnerPhoto({ student }: { student: ReportCardStudent }) {
  return (
    <div className="w-16 h-20 border border-border-strong shrink-0 overflow-hidden bg-bg-subtle flex items-center justify-center">
      {student.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.photoUrl} alt={student.studentName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-lg font-extrabold text-text-faint uppercase">{initialsOf(student.studentName)}</span>
      )}
    </div>
  );
}

export interface CardBands {
  primaryBands: GradeBand[];
  nurseryBands: GradeBand[];
  oLevelBands: GradeBand[];
  principalBands: GradeBand[];
  subsidiaryBands: GradeBand[];
}

/** Every part of one learner's card, built once and laid out by either renderer. */
export interface CardParts {
  logo: React.ReactNode;
  photo: React.ReactNode;
  schoolName: (align?: string, size?: number) => React.ReactNode;
  schoolDetails: (align?: string) => React.ReactNode;
  examTitle: (align?: string) => React.ReactNode;
  badge: React.ReactNode;
  header: React.ReactNode;
  learner: React.ReactNode;
  results: React.ReactNode;
  summary: React.ReactNode;
  ratings: React.ReactNode;
  remarks: React.ReactNode;
  signatures: React.ReactNode;
  issuedDate: (align?: string) => React.ReactNode;
  gradingKey: React.ReactNode;
  footerNote: (align?: string) => React.ReactNode;
  /** What {student}, {class}, … in a text block become. */
  placeholders: Record<string, string>;
}

const ALIGN_CLASS: Record<string, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function buildCardParts(sheet: Sheet, schoolInfo: SchoolInfo | null, bands: CardBands, design: TemplateDesign): CardParts {
  const { student, exam, klass, stream, aggregation, totalInClass, showPositions, fields, nurseryRatings, compared, mode } = sheet;
  const { primaryBands, nurseryBands, oLevelBands, principalBands, subsidiaryBands } = bands;
  const look: TableLook = { columns: design.columns, density: design.style.density, table: design.style.table };
  const columns = { compared, combined: mode === 'combined', examLabel: exam.label, look };
  const compact = design.style.density === 'compact';
  const gap = compact ? 'space-y-1.5' : 'space-y-2.5';
  const isALevel = klass.phase === 'A_LEVEL';
  const isPrimary = klass.phase === 'PRIMARY';
  const isNursery = klass.phase === 'KINDERGARTEN';
  const pleSubjects = student.subjects.filter((s) => s.isExaminable);
  const otherSubjects = student.subjects.filter((s) => !s.isExaminable);
  const pleScored = pleSubjects.filter((s) => !s.isAbsent && s.rawScore !== null);
  const pleTotal = pleScored.reduce((sum, s) => sum + (s.mark ?? s.rawScore!), 0);
  const pleOutOf = pleSubjects.reduce((sum, s) => sum + (s.mark !== null ? s.maxMark : 100), 0);
  const principalSubjects = student.subjects.filter((s) => s.role === 'principal');
  const subsidiarySubjects = student.subjects.filter((s) => s.role === 'subsidiary');
  const schoolName = schoolInfo?.name ?? 'School';
  const subtitle = [schoolInfo?.address, schoolInfo?.district].filter(Boolean).join(', ');
  const emis = schoolInfo?.emisCodes?.[isPrimary ? 'PRIMARY' : isNursery ? 'KINDERGARTEN' : 'SECONDARY'];
  const issuedOn = new Date(exam.publishedAt ?? Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const className = `${klass.name}${(stream?.name ?? student.streamName) ? ` ${stream?.name ?? student.streamName}` : ''}`;
  const position = student.rank ? `${student.rank} of ${totalInClass}` : '—';
  const attendance = fields.attendance && {
    label: 'Attendance',
    value: student.attendance ? `${student.attendance.present} / ${student.attendance.total} days` : '—',
  };
  const average = (n: number | null) => (n !== null ? `${round(n)}%` : '—');

  const logo = fields.schoolLogo ? (
    <div className="w-full h-full min-w-12 min-h-12 aspect-square rounded-full border-2 border-primary-700 flex items-center justify-center overflow-hidden bg-primary-50">
      {schoolInfo?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={schoolInfo.logoUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <span className="text-primary-700 font-extrabold text-sm">{initialsOf(schoolName)}</span>
      )}
    </div>
  ) : null;
  const photo = fields.studentPhoto ? <LearnerPhoto student={student} /> : null;
  const schoolNameNode = (align = 'center', size?: number) => (
    <p
      className={`${ALIGN_CLASS[align]} ${size ? '' : 'text-xl'} font-extrabold text-primary-700 uppercase tracking-wide leading-tight`}
      style={size ? { fontSize: `${size}pt` } : undefined}
    >
      {schoolName}
    </p>
  );
  const schoolDetails = (align = 'center') => (
    <div className={ALIGN_CLASS[align]}>
      {fields.schoolAddress && subtitle && (
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{subtitle}</p>
      )}
      {fields.emisNumber && emis && <p className="text-[10px] font-semibold text-text-muted tracking-wide">EMIS No. {emis}</p>}
    </div>
  );
  const examTitle = (align = 'center') => (
    <p className={`${ALIGN_CLASS[align]} text-[11px] font-bold text-primary-700 uppercase tracking-wide`}>
      {exam.name} &middot; {exam.termName}
    </p>
  );
  const badge = design.text.title ? (
    <span
      className="inline-block px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white"
      style={{ background: 'var(--rc-highlight, #FF8E2B)' }}
    >
      {design.text.title}
    </span>
  ) : null;

  const left = design.style.header === 'left';
  const header = (
    <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-1.5' : 'mb-2.5'}`}>
      {/* Fixed-width side slots keep the school name centred whichever are shown. */}
      {(!left || logo) && <div className={`${left ? 'w-12' : 'w-16'} shrink-0 flex justify-start`}>{logo && <div className="w-12 h-12">{logo}</div>}</div>}
      <div className={`flex-1 ${left ? 'text-left' : 'text-center'}`}>
        {schoolNameNode(left ? 'left' : 'center')}
        {schoolDetails(left ? 'left' : 'center')}
        <div className="mt-1">{examTitle(left ? 'left' : 'center')}</div>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      <div className="w-16 shrink-0 flex justify-end">{photo}</div>
    </div>
  );

  const field = (label: string, value: string) => (
    <p className="flex items-baseline gap-2">
      <span className="text-text-muted">{label}:</span>
      <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">{value}</span>
    </p>
  );
  const learner = (
    <div className={`space-y-1 ${compact ? 'text-xs' : 'text-sm'} border-t border-b border-border py-1.5`}>
      <p className="flex items-baseline gap-2">
        <span className="text-text-muted shrink-0">Student Name:</span>
        <span className="flex-1 border-b border-dotted border-border-strong font-semibold text-primary-900 pb-0.5">
          {student.studentName}
        </span>
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-1">
        {field('Class', className)}
        {fields.studentId && field('Student ID', student.systemId ?? '—')}
        {showPositions && field('Position', position)}
      </div>
    </div>
  );

  let results: React.ReactNode;
  let summary: React.ReactNode;
  let remarks: React.ReactNode = null;
  if (isALevel) {
    results = (
      <div className={gap}>
        <ReportSubjectTable title="Principal Subjects" subjects={principalSubjects} fields={fields} bands={principalBands} {...columns} />
        <ReportSubjectTable title="Subsidiary Subjects" subjects={subsidiarySubjects} fields={fields} bands={subsidiaryBands} {...columns} />
      </div>
    );
    summary = (
      <div className={gap}>
        <div className="grid grid-cols-2 gap-2.5">
          <StatRow
            items={[
              fields.average && { label: 'Principal Avg', value: average(student.principalAverage) },
              fields.overallGrade && { label: 'Principal Grade', value: student.principalGrade ?? '—' },
            ]}
          />
          <StatRow
            items={[
              fields.average && { label: 'Subsidiary Avg', value: average(student.subsidiaryAverage) },
              fields.overallGrade && { label: 'Subsidiary Grade', value: student.subsidiaryGrade ?? '—' },
            ]}
          />
        </div>
        <StatRow items={[attendance]} />
      </div>
    );
    if (fields.remarks) {
      remarks = (
        <RemarksBox
          lines={[
            { label: 'Principal', text: student.principalComment },
            { label: 'Subsidiary', text: student.subsidiaryComment },
          ]}
        />
      );
    }
  } else if (isPrimary) {
    results = (
      <div className={gap}>
        <ReportSubjectTable title="Examinable Subjects (PLE)" subjects={pleSubjects} fields={fields} bands={primaryBands} showPoints {...columns} />
        {fields.otherSubjects && (
          <ReportSubjectTable title="Other Subjects" subjects={otherSubjects} fields={fields} bands={primaryBands} {...columns} />
        )}
      </div>
    );
    summary = (
      <StatRow
        items={[
          fields.totalMarks && { label: 'Total Marks', value: pleScored.length ? `${round(pleTotal)} / ${pleOutOf}` : '—' },
          fields.average && { label: 'Average', value: average(student.average) },
          fields.aggregate && { label: 'Aggregate', value: student.aggregate !== null ? String(student.aggregate) : '—' },
          fields.division && { label: 'Division', value: student.division ?? '—' },
          attendance,
        ]}
      />
    );
    if (fields.remarks) remarks = <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />;
  } else {
    results = (
      <ReportSubjectTable title="Subjects" subjects={student.subjects} fields={fields} bands={isNursery ? nurseryBands : oLevelBands} {...columns} />
    );
    summary = (
      <StatRow
        items={[
          fields.average && { label: 'Average', value: average(student.average) },
          fields.overallGrade && { label: 'Overall Grade', value: student.overallGrade ?? '—' },
          attendance,
        ]}
      />
    );
    if (fields.remarks) remarks = <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />;
  }
  const ratings = fields.progressRatings && nurseryRatings ? <NurseryRatingsTable data={nurseryRatings} /> : null;

  const signatureLabels = design.text.signatures.filter((s) => s.trim());
  const signatures =
    fields.signatures && signatureLabels.length > 0 ? (
      <div
        className="grid gap-6 text-xs text-text-muted text-center"
        style={{ gridTemplateColumns: `repeat(${signatureLabels.length}, minmax(0, 1fr))` }}
      >
        {signatureLabels.map((label, i) => (
          <div key={i}>
            <div className="h-5 border-b border-border mb-1" />
            {label}
          </div>
        ))}
      </div>
    ) : null;
  const issuedDate = (align = 'left') =>
    fields.issuedDate ? <p className={`${ALIGN_CLASS[align]} text-[10px] text-text-faint`}>Issued on {issuedOn}</p> : null;
  const gradingKey = fields.gradingKey ? (
    <GradingLegend
      bands={isALevel ? [...principalBands, ...subsidiaryBands] : isPrimary ? primaryBands : isNursery ? nurseryBands : oLevelBands}
      divisions={isPrimary ? aggregation?.divisions : undefined}
    />
  ) : null;
  const footerNote = (align = 'center') =>
    design.text.footerNote.trim() ? (
      <p className={`${ALIGN_CLASS[align]} text-[10px] text-text-secondary whitespace-pre-line`}>{design.text.footerNote}</p>
    ) : null;

  const overallGrade = isALevel ? student.principalGrade : student.overallGrade;
  return {
    logo,
    photo,
    schoolName: schoolNameNode,
    schoolDetails,
    examTitle,
    badge,
    header,
    learner,
    results,
    summary,
    ratings,
    remarks,
    signatures,
    issuedDate,
    gradingKey,
    footerNote,
    placeholders: {
      school: schoolName,
      student: student.studentName,
      class: className,
      id: student.systemId ?? '',
      position: showPositions ? position : '',
      average: average(isALevel ? student.principalAverage : student.average),
      grade: overallGrade ?? '—',
      exam: exam.name,
      term: exam.termName,
      date: issuedOn,
    },
  };
}

const FRAME_OUTER: Record<TemplateStyle['frame'], string> = {
  double: 'border-4 border-primary-700 p-1',
  single: 'border-2 border-primary-700',
  none: '',
};
const FRAME_INNER: Record<TemplateStyle['frame'], string> = {
  double: 'border border-primary-700',
  single: '',
  none: '',
};

/** A flowing card: header, learner, results, summary, remarks, footer. */
function StyledCard({ parts, design }: { parts: CardParts; design: TemplateDesign }) {
  const compact = design.style.density === 'compact';
  return (
    <div className="report-sheet bg-white p-2 max-w-[800px] mx-auto" style={templateVars(design.style)}>
      <div className={FRAME_OUTER[design.style.frame]}>
        <div className={`${FRAME_INNER[design.style.frame]} ${compact ? 'p-3' : 'p-4'}`}>
          {parts.header}
          <div className={compact ? 'mb-1.5' : 'mb-2.5'}>{parts.learner}</div>
          <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
            {parts.results}
            {parts.summary}
            {parts.ratings}
            {parts.remarks}
          </div>
          {parts.signatures && <div className={compact ? 'mt-3' : 'mt-4'}>{parts.signatures}</div>}
          {parts.issuedDate() && <div className="mt-2">{parts.issuedDate()}</div>}
          {parts.footerNote() && <div className="mt-2">{parts.footerNote()}</div>}
          {parts.gradingKey}
        </div>
      </div>
    </div>
  );
}

const colorOf = (value: unknown, fallback: string) =>
  value === 'accent' ? 'var(--color-primary-700)' : typeof value === 'string' && value ? value : fallback;

/** One page-editor block's content, sized to fill its box. Shared with the editor. */
export function CanvasBlockContent({ block, parts }: { block: CanvasBlock; parts: CardParts }) {
  const p = block.props;
  const align = typeof p.align === 'string' ? p.align : undefined;
  switch (block.type) {
    case 'header':
      return <>{parts.header}</>;
    case 'schoolName':
      return <>{parts.schoolName(align, typeof p.size === 'number' ? p.size : undefined)}</>;
    case 'schoolDetails':
      return <>{parts.schoolDetails(align)}</>;
    case 'examTitle':
      return <>{parts.examTitle(align)}</>;
    case 'badge':
      return <div className="text-center">{parts.badge}</div>;
    case 'logo':
      return <div className="w-full h-full flex items-center justify-center">{parts.logo}</div>;
    case 'photo':
      return parts.photo ? <div className="w-full h-full [&>div]:w-full [&>div]:h-full">{parts.photo}</div> : null;
    case 'learner':
      return <>{parts.learner}</>;
    case 'results':
      return (
        <div className="space-y-2">
          {parts.results}
          {parts.ratings}
        </div>
      );
    case 'summary':
      return <>{parts.summary}</>;
    case 'remarks':
      return <>{parts.remarks}</>;
    case 'signatures':
      return <div className="pt-2">{parts.signatures}</div>;
    case 'issuedDate':
      return <>{parts.issuedDate(align)}</>;
    case 'gradingKey':
      return <div className="[&>div]:mt-0 [&>div]:pt-0 [&>div]:border-0">{parts.gradingKey}</div>;
    case 'footerNote':
      return <>{parts.footerNote(align)}</>;
    case 'text':
      return (
        <p
          className="whitespace-pre-line leading-snug"
          style={{
            fontSize: `${p.size}pt`,
            fontWeight: p.bold ? 700 : 400,
            fontStyle: p.italic ? 'italic' : 'normal',
            textTransform: p.uppercase ? 'uppercase' : 'none',
            textAlign: (align ?? 'left') as 'left' | 'center' | 'right',
            color: colorOf(p.color, '#1F2937'),
          }}
        >
          {fillPlaceholders(String(p.text ?? ''), parts.placeholders)}
        </p>
      );
    case 'line': {
      const vertical = block.h > block.w;
      const thickness = `${Number(p.thickness) || 1}px`;
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div
            style={{
              background: colorOf(p.color, 'var(--color-primary-700)'),
              width: vertical ? thickness : '100%',
              height: vertical ? '100%' : thickness,
            }}
          />
        </div>
      );
    }
    case 'box':
      return (
        <div
          className="w-full h-full"
          style={{
            border: `${Number(p.thickness) || 0}px solid ${colorOf(p.color, 'var(--color-primary-700)')}`,
            background: typeof p.fill === 'string' && p.fill ? p.fill : 'transparent',
            borderRadius: `${Number(p.radius) || 0}mm`,
          }}
        />
      );
  }
}

/** A page-editor card: each block where the school put it. The results table
 * grows with the learner's subjects, and whatever sits below it moves down by
 * as much, so a long subject list never covers the summary or signatures. */
function CanvasCard({ parts, design }: { parts: CardParts; design: TemplateDesign }) {
  const blocks = design.blocks ?? [];
  const results = blocks.find((b) => b.type === 'results');
  const resultsRef = useRef<HTMLDivElement>(null);
  const [growth, setGrowth] = useState(0);

  useLayoutEffect(() => {
    const el = resultsRef.current;
    if (!el || !results) return;
    const measure = () => setGrowth(Math.max(0, el.scrollHeight / PX_PER_MM - results.h));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [results]);

  const resultsBottom = results ? results.y + results.h : Infinity;
  const shift = (b: CanvasBlock) => (b !== results && b.y >= resultsBottom - 0.5 ? growth : 0);
  const pageHeight = Math.max(PAGE_MM.height, ...blocks.map((b) => b.y + b.h + shift(b) + 8));

  return (
    <div
      className="report-sheet report-canvas bg-white mx-auto relative overflow-hidden"
      style={{ ...templateVars(design.style), width: `${PAGE_MM.width}mm`, height: `${pageHeight}mm` }}
    >
      {blocks.map((b) => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${b.x}mm`,
          top: `${b.y + shift(b)}mm`,
          width: `${b.w}mm`,
          [b === results ? 'minHeight' : 'height']: `${b.h}mm`,
        };
        return (
          <div key={b.id} style={style} ref={b === results ? resultsRef : undefined} className={b === results ? '' : 'overflow-hidden'}>
            <CanvasBlockContent block={b} parts={parts} />
          </div>
        );
      })}
    </div>
  );
}

export function StudentReportCardSheet({
  sheet,
  schoolInfo,
  ...bands
}: {
  sheet: Sheet;
  schoolInfo: SchoolInfo | null;
} & CardBands) {
  const template = sheet.template;
  const design = template?.design ?? CLASSIC_DESIGN;
  const parts = buildCardParts(sheet, schoolInfo, bands, design);
  return template?.kind === 'canvas' ? <CanvasCard parts={parts} design={design} /> : <StyledCard parts={parts} design={design} />;
}

/** The grading bands each level prints with, from the school's selections. */
export function bandsFrom(schemes: SchoolGradingSchemeSelection[]) {
  const find = (appliesTo: SubjectPhase, roleScope: 'any' | 'principal' | 'subsidiary') =>
    schemes.find((g) => g.appliesTo === appliesTo && g.roleScope === roleScope)?.scheme.bands ?? [];
  return {
    primaryBands: find('PRIMARY', 'any'),
    nurseryBands: find('KINDERGARTEN', 'any'),
    oLevelBands: find('O_LEVEL', 'any'),
    principalBands: find('A_LEVEL', 'principal'),
    subsidiaryBands: find('A_LEVEL', 'subsidiary'),
  };
}
