'use client';

import type { SchoolLevel, SchoolSection, SubjectPhase } from '@/lib/levels';

// One learner's printed report card — used by the report-cards print page
// (and its server-side PDF) and by Report Card Layout's live preview, so what
// a school sees while choosing its layout is exactly what prints.

type SubjectRole = 'principal' | 'subsidiary';

export interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
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
export interface ExamReportCard {
  exam: { id: string; name: string; termId: string; termName: string; publishedAt: string | null };
  /** The school's choice, per section, whether report cards show positions. */
  showPositions: boolean;
  /** The school's choice, per section, of what else report cards show. */
  reportCardFields: ReportCardFields;
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
  | 'score'
  | 'grade'
  | 'points'
  | 'subjectRemarks'
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
      { key: 'score', label: 'Score', sections: ALL, default: true },
      { key: 'grade', label: 'Grade', sections: ALL, default: true },
      { key: 'points', label: 'Points (D1 = 1 … F9 = 9)', sections: ['PRIMARY'], default: true },
      { key: 'subjectRemarks', label: 'Remark per subject', sections: ALL, default: true },
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
}

function ReportSubjectTable({
  title,
  subjects,
  fields,
  bands = [],
  showPoints = false,
}: {
  title: string;
  subjects: ReportCardStudentSubject[];
  fields: ReportCardFields;
  /** Live-grade fallback for an unpublished exam (Primary). */
  bands?: GradeBand[];
  showPoints?: boolean;
}) {
  if (subjects.length === 0) return null;
  const points = showPoints && fields.points;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">{title}</p>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-bg-subtle text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
            {fields.rowNumbers && <th className="py-1 px-2 border-b border-r border-border w-8 text-center">#</th>}
            <th className="py-1 px-2 border-b border-r border-border">Subject</th>
            {fields.score && <th className="py-1 px-2 border-b border-r border-border text-right">Score</th>}
            {fields.grade && <th className="py-1 px-2 border-b border-r border-border text-center">Grade</th>}
            {points && <th className="py-1 px-2 border-b border-r border-border text-center">Points</th>}
            {fields.subjectRemarks && <th className="py-1 px-2 border-b border-border">Remarks</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => {
            const grade = gradeOf(s, bands);
            return (
              <tr key={s.subjectId} className="border-b border-border last:border-0">
                {fields.rowNumbers && (
                  <td className="py-1 px-2 border-r border-border text-center text-text-faint tabular-nums">{i + 1}</td>
                )}
                <td className="py-1 px-2 border-r border-border">
                  {s.subjectName}
                  {fields.paperBreakdown && s.hasVariant && s.variantScores && (
                    <span className="block text-[10px] text-text-faint">
                      {s.variantScores
                        .map((v) => `${v.name} ${v.isAbsent ? 'Abs' : v.rawScore !== null ? round(v.rawScore) : '—'}`)
                        .join(' · ')}
                    </span>
                  )}
                </td>
                {fields.score && (
                  <td className="py-1 px-2 border-r border-border text-right tabular-nums font-semibold">
                    {s.isAbsent ? (
                      <span className="text-text-muted font-normal">Absent</span>
                    ) : s.rawScore !== null ? (
                      // Out of the subject's own full mark when it isn't 100.
                      s.mark !== null && s.maxMark !== 100 ? `${round(s.mark)}/${s.maxMark}` : round(s.rawScore)
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {fields.grade && (
                  <td className="py-1 px-2 border-r border-border text-center">
                    {grade ? (
                      <span
                        className={`inline-flex min-w-6 justify-center px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${gradeChip(
                          grade,
                        )}`}
                      >
                        {grade}
                      </span>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>
                )}
                {points && (
                  <td className="py-1 px-2 border-r border-border text-center tabular-nums font-semibold">
                    {s.points ?? '—'}
                  </td>
                )}
                {fields.subjectRemarks && (
                  <td className="py-1 px-2 text-text-faint">{bands.find((b) => b.label === grade)?.comment ?? ' '}</td>
                )}
              </tr>
            );
          })}
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

export function StudentReportCardSheet({
  sheet,
  schoolInfo,
  primaryBands,
  nurseryBands,
  oLevelBands,
  principalBands,
  subsidiaryBands,
}: {
  sheet: Sheet;
  schoolInfo: SchoolInfo | null;
  primaryBands: GradeBand[];
  nurseryBands: GradeBand[];
  oLevelBands: GradeBand[];
  principalBands: GradeBand[];
  subsidiaryBands: GradeBand[];
}) {
  const { student, exam, klass, stream, aggregation, totalInClass, showPositions, fields, nurseryRatings } = sheet;
  const isALevel = klass.phase === 'A_LEVEL';
  const isPrimary = klass.phase === 'PRIMARY';
  const pleSubjects = student.subjects.filter((s) => s.isExaminable);
  const otherSubjects = student.subjects.filter((s) => !s.isExaminable);
  const pleScored = pleSubjects.filter((s) => !s.isAbsent && s.rawScore !== null);
  const pleTotal = pleScored.reduce((sum, s) => sum + (s.mark ?? s.rawScore!), 0);
  const pleOutOf = pleSubjects.reduce((sum, s) => sum + (s.mark !== null ? s.maxMark : 100), 0);
  const isNursery = klass.phase === 'KINDERGARTEN';
  const principalSubjects = student.subjects.filter((s) => s.role === 'principal');
  const subsidiarySubjects = student.subjects.filter((s) => s.role === 'subsidiary');
  const schoolName = schoolInfo?.name ?? 'School';
  const subtitle = [schoolInfo?.address, schoolInfo?.district].filter(Boolean).join(', ');
  const emis = schoolInfo?.emisCodes?.[isPrimary ? 'PRIMARY' : klass.phase === 'KINDERGARTEN' ? 'KINDERGARTEN' : 'SECONDARY'];
  const issuedOn = exam.publishedAt
    ? new Date(exam.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const attendance = fields.attendance && {
    label: 'Attendance',
    value: student.attendance ? `${student.attendance.present} / ${student.attendance.total} days` : '—',
  };

  return (
    <div className="report-sheet bg-white p-2 max-w-[800px] mx-auto">
      {/* Certificate-style double frame, matching the school's printed marksheet layout. */}
      <div className="border-4 border-primary-700 p-1">
        <div className="border border-primary-700 p-4">
          <div className="flex items-start justify-between gap-3 mb-2.5">
            {/* Fixed-width side slots keep the school name centred whichever are shown. */}
            <div className="w-16 shrink-0 flex justify-start">
              {fields.schoolLogo && (
                <div className="w-12 h-12 rounded-full border-2 border-primary-700 flex items-center justify-center overflow-hidden bg-primary-50">
                  {schoolInfo?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={schoolInfo.logoUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-primary-700 font-extrabold text-sm">{initialsOf(schoolName)}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 text-center">
              <p className="text-xl font-extrabold text-primary-700 uppercase tracking-wide leading-tight">
                {schoolName}
              </p>
              {fields.schoolAddress && subtitle && (
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{subtitle}</p>
              )}
              {fields.emisNumber && emis && (
                <p className="text-[10px] font-semibold text-text-muted tracking-wide">EMIS No. {emis}</p>
              )}
              <p className="text-[11px] font-bold text-primary-700 uppercase tracking-wide mt-1">
                {exam.name} &middot; {exam.termName}
              </p>
              <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white bg-gradient-to-r from-accent-dark to-accent">
                Report Card
              </span>
            </div>
            <div className="w-16 shrink-0 flex justify-end">{fields.studentPhoto && <LearnerPhoto student={student} />}</div>
          </div>

          <div className="space-y-1 text-sm mb-2.5 border-t border-b border-border py-1.5">
            <p className="flex items-baseline gap-2">
              <span className="text-text-muted shrink-0">Student Name:</span>
              <span className="flex-1 border-b border-dotted border-border-strong font-semibold text-primary-900 pb-0.5">
                {student.studentName}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Class:</span>
                <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                  {klass.name}
                  {(stream?.name ?? student.streamName) ? ` ${stream?.name ?? student.streamName}` : ''}
                </span>
              </p>
              {fields.studentId && (
                <p className="flex items-baseline gap-2">
                  <span className="text-text-muted">Student ID:</span>
                  <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                    {student.systemId ?? '—'}
                  </span>
                </p>
              )}
              {showPositions && (
                <p className="flex items-baseline gap-2">
                  <span className="text-text-muted">Position:</span>
                  <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                    {student.rank ? `${student.rank} of ${totalInClass}` : '—'}
                  </span>
                </p>
              )}
            </div>
          </div>

          {isALevel ? (
            <div className="space-y-2.5">
              <ReportSubjectTable title="Principal Subjects" subjects={principalSubjects} fields={fields} />
              <ReportSubjectTable title="Subsidiary Subjects" subjects={subsidiarySubjects} fields={fields} />
              <div className="grid grid-cols-2 gap-2.5">
                <StatRow
                  items={[
                    fields.average && {
                      label: 'Principal Avg',
                      value: student.principalAverage !== null ? `${round(student.principalAverage)}%` : '—',
                    },
                    fields.overallGrade && { label: 'Principal Grade', value: student.principalGrade ?? '—' },
                  ]}
                />
                <StatRow
                  items={[
                    fields.average && {
                      label: 'Subsidiary Avg',
                      value: student.subsidiaryAverage !== null ? `${round(student.subsidiaryAverage)}%` : '—',
                    },
                    fields.overallGrade && { label: 'Subsidiary Grade', value: student.subsidiaryGrade ?? '—' },
                  ]}
                />
              </div>
              <StatRow items={[attendance]} />
              {fields.remarks && (
                <RemarksBox
                  lines={[
                    { label: 'Principal', text: student.principalComment },
                    { label: 'Subsidiary', text: student.subsidiaryComment },
                  ]}
                />
              )}
            </div>
          ) : isPrimary ? (
            <div className="space-y-2.5">
              <ReportSubjectTable
                title="Examinable Subjects (PLE)"
                subjects={pleSubjects}
                fields={fields}
                bands={primaryBands}
                showPoints
              />
              {fields.otherSubjects && (
                <ReportSubjectTable title="Other Subjects" subjects={otherSubjects} fields={fields} bands={primaryBands} />
              )}
              <StatRow
                items={[
                  fields.totalMarks && { label: 'Total Marks', value: pleScored.length ? `${round(pleTotal)} / ${pleOutOf}` : '—' },
                  fields.average && { label: 'Average', value: student.average !== null ? `${round(student.average)}%` : '—' },
                  fields.aggregate && { label: 'Aggregate', value: student.aggregate !== null ? String(student.aggregate) : '—' },
                  fields.division && { label: 'Division', value: student.division ?? '—' },
                  attendance,
                ]}
              />
              {fields.remarks && <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />}
            </div>
          ) : (
            <div className="space-y-2.5">
              <ReportSubjectTable
                title="Subjects"
                subjects={student.subjects}
                fields={fields}
                bands={isNursery ? nurseryBands : []}
              />
              <StatRow
                items={[
                  fields.average && { label: 'Average', value: student.average !== null ? `${round(student.average)}%` : '—' },
                  fields.overallGrade && { label: 'Overall Grade', value: student.overallGrade ?? '—' },
                  attendance,
                ]}
              />
              {fields.progressRatings && nurseryRatings && <NurseryRatingsTable data={nurseryRatings} />}
              {fields.remarks && <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />}
            </div>
          )}

          {fields.signatures && (
            <div className="grid grid-cols-3 gap-6 mt-4 text-xs text-text-muted text-center">
              <div>
                <div className="h-5 border-b border-border mb-1" />
                Class Teacher&apos;s Signature
              </div>
              <div>
                <div className="h-5 border-b border-border mb-1" />
                Parent/Guardian&apos;s Signature
              </div>
              <div>
                <div className="h-5 border-b border-border mb-1" />
                Head Teacher&apos;s Signature
              </div>
            </div>
          )}
          {fields.issuedDate && <p className="text-[10px] text-text-faint mt-2">Issued on {issuedOn}</p>}

          {fields.gradingKey && (
            <GradingLegend
              bands={
                isALevel
                  ? [...principalBands, ...subsidiaryBands]
                  : isPrimary
                    ? primaryBands
                    : isNursery
                      ? nurseryBands
                      : oLevelBands
              }
              divisions={isPrimary ? aggregation?.divisions : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
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
