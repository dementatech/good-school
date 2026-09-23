'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SchoolLevel } from '@/lib/levels';
import { useRouter } from 'next/navigation';
import { arc as d3arc, max, pie as d3pie, scaleBand, scaleLinear } from 'd3';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/loader';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { useElementSize } from '@/lib/useElementSize';
import { AlertTriangle, FileText, TrendingUp, Trophy } from 'lucide-react';
import type { SchoolExam } from '@/components/admin/exams/types';

const PRIMARY_600 = '#1e40af';
const ACCENT_DARK = '#C4952A';
const ERROR = '#C0392B';

interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}
interface SchoolClass {
  id: string;
  stageCode: string;
  stageName: string;
  stagePhase: SchoolLevel;
  hasStreams: boolean;
}
interface Stream {
  id: string;
  classId: string;
  name: string;
}

type SubjectRole = 'principal' | 'subsidiary';

interface ReportCardSubject {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  role: SubjectRole;
  teacherName: string | null;
  rosterCount: number;
  enteredCount: number;
  submitted: boolean;
  average: number | null;
}
interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
  role: SubjectRole;
  hasVariant: boolean;
  variantScores?: { name: string; rawScore: number | null; isAbsent: boolean }[];
  rawScore: number | null;
  isAbsent: boolean;
  computedGrade: string | null;
  isExaminable: boolean;
  points: number | null;
  /** Primary: live band grade for an unpublished exam. */
  bandGrade: string | null;
}
interface ReportCardStudent {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  streamId: string | null;
  streamName: string | null;
  average: number | null;
  overallGrade: string | null;
  overallComment: string | null;
  principalAverage: number | null;
  principalGrade: string | null;
  principalComment: string | null;
  subsidiaryAverage: number | null;
  subsidiaryGrade: string | null;
  subsidiaryComment: string | null;
  /** Primary: PLE aggregate (lower is better) and its division. */
  aggregate: number | null;
  division: string | null;
  rank: number | null;
  subjects: ReportCardStudentSubject[];
}
interface ExamReportCard {
  exam: { id: string; name: string; termName: string; publishedAt: string | null };
  class: { id: string; name: string; phase: SchoolLevel };
  stream: { id: string; name: string } | null;
  subjects: ReportCardSubject[];
  gradeDistribution: { grade: string; count: number }[];
  subsidiaryGradeDistribution: { grade: string; count: number }[];
  divisionDistribution: { division: string; count: number }[];
  streamAverages: { streamId: string; streamName: string; average: number }[];
  students: ReportCardStudent[];
  topPerformers: ReportCardStudent[];
  needsAttention: ReportCardStudent[];
}

const GRADE_CHIP: Record<string, string> = {
  A: 'bg-success-bg text-success',
  B: 'bg-primary-50 text-primary-700',
  C: 'bg-accent-light text-accent-dark',
  D: 'bg-warning-bg text-warning',
  E: 'bg-warning-bg text-warning',
  F: 'bg-error-bg text-error',
  Pass: 'bg-success-bg text-success',
  Fail: 'bg-error-bg text-error',
};

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
/** O-Level: one blended average/grade for everything. A-Level: the
 * principal average/grade is what actually ranks and represents a student —
 * subsidiaries (General Paper + the combination's chosen one) are reported
 * separately, never blended in. This picks whichever applies. */
function standing(s: ReportCardStudent, isALevel: boolean): { average: number | null; grade: string | null } {
  return isALevel
    ? { average: s.principalAverage, grade: s.principalGrade }
    : { average: s.average, grade: s.overallGrade };
}

// Every score/average on this page displays as a whole number — the API
// keeps sub-point precision (it feeds ranking), this is presentation only.
function round(n: number): number {
  return Math.round(n);
}

function SubjectTable({ rows, onRowClick }: { rows: ReportCardSubject[]; onRowClick: (subjectId: string) => void }) {
  return (
    <table className="w-full text-sm min-w-[640px]">
      <thead>
        <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
          <th className="py-2.5 px-4">Subject</th>
          <th className="py-2.5 px-2">Lead teacher</th>
          <th className="py-2.5 px-2">Entered</th>
          <th className="py-2.5 px-2">Status</th>
          <th className="py-2.5 px-4 text-right">Class avg</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.subjectId}
            className="border-b border-border last:border-0 cursor-pointer hover:bg-bg-subtle"
            onClick={() => onRowClick(row.subjectId)}
          >
            <td className="py-3 px-4 font-semibold text-primary-900">{row.subjectName}</td>
            <td className="py-3 px-2 text-text-muted">{row.teacherName ?? '—'}</td>
            <td className="py-3 px-2">
              <div className="tabular-nums">{row.enteredCount}/{row.rosterCount}</div>
              <div className="h-1 w-16 rounded-full bg-bg-muted overflow-hidden mt-1">
                <div
                  className="h-full rounded-full bg-primary-600"
                  style={{ width: `${row.rosterCount ? (row.enteredCount / row.rosterCount) * 100 : 0}%` }}
                />
              </div>
            </td>
            <td className="py-3 px-2">
              {row.submitted ? <Badge variant="success">Submitted</Badge> : <Badge variant="accent">In progress</Badge>}
            </td>
            <td className="py-3 px-4 text-right tabular-nums font-semibold text-primary-900">
              {row.average !== null ? `${round(row.average)}%` : <span className="text-text-faint font-normal">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const GRADE_CHART_HEIGHT = 200;

function GradeChart({ data }: { data: { grade: string; count: number }[] }) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const axisHeight = 20;
  const plotWidth = Math.max(0, width - 8);
  const plotHeight = GRADE_CHART_HEIGHT - axisHeight - 20;
  const x = scaleBand()
    .domain(data.map((d) => d.grade))
    .range([0, plotWidth])
    .paddingInner(0.35)
    .paddingOuter(0.15);
  const y = scaleLinear()
    .domain([0, Math.max(1, max(data, (d) => d.count) ?? 1)])
    .range([plotHeight, 0]);

  return (
    <div ref={ref} style={{ width: '100%', height: GRADE_CHART_HEIGHT }}>
      {width > 0 && (
        <svg width={width} height={GRADE_CHART_HEIGHT} role="img" aria-label="Grade distribution">
          <g transform="translate(4, 16)">
            {data.map((d) => {
              const bx = x(d.grade) ?? 0;
              const barHeight = plotHeight - y(d.count);
              return (
                <g key={d.grade}>
                  <title>{`${d.grade}: ${d.count} entr${d.count === 1 ? 'y' : 'ies'}`}</title>
                  <rect
                    x={bx}
                    y={y(d.count)}
                    width={x.bandwidth()}
                    height={Math.max(0, barHeight)}
                    fill={d.grade === 'F' || d.grade === 'Fail' ? ERROR : PRIMARY_600}
                    rx={4}
                  />
                  <text
                    x={bx + x.bandwidth() / 2}
                    y={y(d.count) - 6}
                    textAnchor="middle"
                    className="fill-[var(--color-text-secondary)]"
                    fontSize={12}
                  >
                    {d.count}
                  </text>
                  <text
                    x={bx + x.bandwidth() / 2}
                    y={plotHeight + 16}
                    textAnchor="middle"
                    className="fill-[var(--color-text-secondary)]"
                    fontSize={12}
                  >
                    {d.grade}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

/** Class average per subject, ranked strongest first. A table instead of a
 * chart — the compile board above already has one bar-style comparison
 * (entered/roster progress); this reads as a ranked list instead. */
function SubjectAveragesTable({ subjects }: { subjects: ReportCardSubject[] }) {
  const ranked = [...subjects].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
          <th className="py-2">Subject</th>
          <th className="py-2 text-right">Class average</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((s) => (
          <tr key={s.subjectId} className="border-b border-border/60 last:border-0">
            <td className="py-2 text-primary-900 font-medium">{s.subjectName}</td>
            <td className="py-2 text-right tabular-nums font-bold text-primary-900">
              {s.average !== null ? `${round(s.average)}%` : <span className="text-text-faint font-normal">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STREAM_DONUT_SIZE = 200;
// Fixed order, cycled only if a class somehow has more than 5 streams —
// categorical identity (which stream), not magnitude, so no ramp here.
const STREAM_COLORS = [PRIMARY_600, ACCENT_DARK, 'var(--color-success)', 'var(--color-warning)', 'var(--color-text-muted)'];

/**
 * Design ref: design/charts/Average by stream.jpg — a rounded-pill donut,
 * each stream one segment sized by its own average (so the chart reads as
 * "how the streams compare," not literally "parts of 100" the way a
 * true share-of-total pie would) and directly labeled with that average.
 */
function StreamAveragesChart({ data }: { data: { streamId: string; streamName: string; average: number }[] }) {
  if (data.length === 0) return null;

  const radius = STREAM_DONUT_SIZE / 2;
  const pie = d3pie<{ streamId: string; streamName: string; average: number }>()
    .value((d) => d.average)
    .padAngle(0.05)
    .sort(null);
  const arc = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
    .innerRadius(radius * 0.5)
    .outerRadius(radius * 0.85)
    .cornerRadius(999);
  const labelArc = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
    .innerRadius(radius * 0.675)
    .outerRadius(radius * 0.675);
  const arcs = pie(data);

  return (
    <div className="flex flex-col items-center">
      <svg width={STREAM_DONUT_SIZE} height={STREAM_DONUT_SIZE} role="img" aria-label="Average by stream">
        <g transform={`translate(${radius}, ${radius})`}>
          {arcs.map((a, i) => (
            <g key={a.data.streamId}>
              <title>{`${a.data.streamName}: ${round(a.data.average)}% average`}</title>
              <path d={arc(a) ?? undefined} fill={STREAM_COLORS[i % STREAM_COLORS.length]} />
              <text
                transform={`translate(${labelArc.centroid(a)})`}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white"
                fontSize={13}
                fontWeight={700}
              >
                {round(a.data.average)}%
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2 text-xs text-text-muted">
        {data.map((d, i) => (
          <span key={d.streamId} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
            {d.streamName}
          </span>
        ))}
      </div>
    </div>
  );
}

const HEAT_ROW_HEIGHT = 22;
const HEAT_LABEL_WIDTH = 96;
const HEAT_CELL_WIDTH = 34;

// Sequential magnitude (low score -> high score), one hue light-to-dark —
// the app's own primary scale, which is a runtime-overridable CSS var per
// school (SchoolThemeApplier), so this automatically follows a school's
// brand color instead of a hardcoded blue. Six bins keep adjacent steps
// visually distinct at a 20px cell without needing a continuous gradient.
const HEAT_BINS: { max: number; fill: string; text: 'dark' | 'light' }[] = [
  { max: 39.999, fill: 'var(--color-primary-100)', text: 'dark' },
  { max: 49.999, fill: 'var(--color-primary-200)', text: 'dark' },
  { max: 59.999, fill: 'var(--color-primary-400)', text: 'light' },
  { max: 69.999, fill: 'var(--color-primary-500)', text: 'light' },
  { max: 84.999, fill: 'var(--color-primary-600)', text: 'light' },
  { max: 100, fill: 'var(--color-primary-700)', text: 'light' },
];
function heatBin(score: number) {
  return HEAT_BINS.find((b) => score <= b.max) ?? HEAT_BINS[HEAT_BINS.length - 1];
}

/** First name only — a fixed-width label column can't reliably fit a full
 * name (two students sharing one can still be told apart via the tooltip,
 * which carries the full name, system ID, rank and every other detail). */
function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

/**
 * Students x subjects, cell-shaded by score — spots patterns a table can't:
 * a whole class weak in one subject reads as a pale column, a student
 * struggling everywhere reads as a pale row. Absent (took it, didn't sit it)
 * and not-taken (never registered for it) get their own distinct neutral
 * fills rather than folding into the score ramp.
 *
 * Cells never shrink to fit — a fixed-width label column on the left (never
 * scrolls) and a fixed-width cell grid on the right (scrolls horizontally
 * past its container once there are more subjects than fit) share one
 * vertical scroll, so a wide roster stays readable instead of squeezing
 * scores into illegible cells.
 */
function ResultsHeatmap({ subjects, students }: { subjects: ReportCardSubject[]; students: ReportCardStudent[] }) {
  if (subjects.length === 0 || students.length === 0) {
    return <p className="text-sm text-text-muted py-4">Nothing to show yet.</p>;
  }

  const headerHeight = HEAT_ROW_HEIGHT;
  const gridHeight = headerHeight + students.length * HEAT_ROW_HEIGHT;
  const gridWidth = subjects.length * HEAT_CELL_WIDTH;
  const x = scaleBand()
    .domain(subjects.map((s) => s.subjectId))
    .range([0, gridWidth])
    .padding(0);

  return (
    <div>
      <div className="flex">
        <svg width={HEAT_LABEL_WIDTH} height={gridHeight} role="img" aria-label="Students" className="shrink-0">
          {students.map((student, rowIndex) => {
            const y = headerHeight + rowIndex * HEAT_ROW_HEIGHT;
            return (
              <g key={student.studentUserId}>
                <title>
                  {`${student.studentName} (${student.systemId ?? 'no system ID'})${
                    student.rank ? ` — rank ${student.rank}` : ''
                  }`}
                </title>
                <text
                  x={HEAT_LABEL_WIDTH - 8}
                  y={y + HEAT_ROW_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-[var(--color-text-secondary)]"
                  fontSize={11}
                >
                  {firstName(student.studentName)}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="overflow-x-auto flex-1 print:overflow-visible">
          <svg width={gridWidth} height={gridHeight} role="img" aria-label="Score heatmap — students by subject">
            {subjects.map((s) => {
              const cx = (x(s.subjectId) ?? 0) + HEAT_CELL_WIDTH / 2;
              return (
                <g key={s.subjectId}>
                  <title>{s.subjectName}</title>
                  <text
                    x={cx}
                    y={headerHeight - 7}
                    textAnchor="middle"
                    className="fill-[var(--color-text-muted)]"
                    fontSize={9.5}
                  >
                    {s.subjectShortName}
                  </text>
                </g>
              );
            })}
            {students.map((student, rowIndex) => {
              const bySubject = new Map(student.subjects.map((s) => [s.subjectId, s]));
              const y = headerHeight + rowIndex * HEAT_ROW_HEIGHT;
              return (
                <g key={student.studentUserId}>
                  {subjects.map((subject) => {
                    const cell = bySubject.get(subject.subjectId);
                    const cx = x(subject.subjectId) ?? 0;
                    const idLine = `${student.studentName} (${student.systemId ?? 'no system ID'})`;
                    if (!cell) {
                      return (
                        <g key={subject.subjectId}>
                          <title>{`${idLine} — ${subject.subjectName}: not taken`}</title>
                          <rect
                            x={cx}
                            y={y}
                            width={HEAT_CELL_WIDTH}
                            height={HEAT_ROW_HEIGHT}
                            fill="var(--color-bg-subtle)"
                          />
                        </g>
                      );
                    }
                    if (cell.isAbsent || cell.rawScore === null) {
                      return (
                        <g key={subject.subjectId}>
                          <title>{`${idLine} — ${subject.subjectName}: ${cell.isAbsent ? 'absent' : 'not yet marked'}`}</title>
                          <rect x={cx} y={y} width={HEAT_CELL_WIDTH} height={HEAT_ROW_HEIGHT} fill="var(--color-bg-muted)" />
                          <text
                            x={cx + HEAT_CELL_WIDTH / 2}
                            y={y + HEAT_ROW_HEIGHT / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-[var(--color-text-faint)]"
                            fontSize={9}
                          >
                            {cell.isAbsent ? 'Abs' : ''}
                          </text>
                        </g>
                      );
                    }
                    const bin = heatBin(cell.rawScore);
                    return (
                      <g key={subject.subjectId}>
                        <title>
                          {`${idLine} — ${subject.subjectName}: ${round(cell.rawScore)}%${
                            cell.computedGrade ? ` (${cell.computedGrade})` : ''
                          }`}
                        </title>
                        <rect
                          x={cx}
                          y={y}
                          width={HEAT_CELL_WIDTH}
                          height={HEAT_ROW_HEIGHT}
                          fill={bin.fill}
                          stroke="var(--color-bg-card)"
                          strokeWidth={1}
                        />
                        <text
                          x={cx + HEAT_CELL_WIDTH / 2}
                          y={y + HEAT_ROW_HEIGHT / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className={bin.text === 'light' ? 'fill-white' : 'fill-[var(--color-text-primary)]'}
                          fontSize={9.5}
                        >
                          {round(cell.rawScore)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
        <span>Low</span>
        {HEAT_BINS.map((b) => (
          <span key={b.max} className="inline-block w-4 h-3 rounded-sm" style={{ background: b.fill }} />
        ))}
        <span>High</span>
        <span className="flex items-center gap-1 ml-3">
          <span className="inline-block w-4 h-3 rounded-sm bg-[var(--color-bg-muted)]" /> Absent
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded-sm bg-[var(--color-bg-subtle)] border border-border" /> Not taken
        </span>
      </div>
    </div>
  );
}

// Raw-color counterpart to GRADE_CHIP (that one's Tailwind classes for a
// text badge; SVG fills need an actual color value) — same grade->status
// story, so the gauges below read consistently with every other grade chip
// on this page.
const GRADE_COLOR: Record<string, string> = {
  A: 'var(--color-success)',
  B: 'var(--color-primary-600)',
  C: 'var(--color-accent-dark)',
  D: 'var(--color-warning)',
  E: 'var(--color-warning)',
  F: 'var(--color-error)',
  Pass: 'var(--color-success)',
  Fail: 'var(--color-error)',
};

const GAUGE_SIZE = 88;
const GAUGE_STROKE = 9;

/** Design ref: design/charts/Grade contribution sample.jpg — one ring gauge
 * per grade, not a single combined chart, so each grade's share of the
 * class reads as its own standalone card. */
function GradeGaugeCard({ grade, percent, count }: { grade: string; percent: number; count: number }) {
  const radius = (GAUGE_SIZE - GAUGE_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = GRADE_COLOR[grade] ?? 'var(--color-text-faint)';
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} role="img" aria-label={`Grade ${grade}: ${percent}% of students`}>
        <title>{`Grade ${grade}: ${count} student${count === 1 ? '' : 's'} (${percent}%)`}</title>
        <circle cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={radius} fill="none" stroke="var(--color-bg-muted)" strokeWidth={GAUGE_STROKE} />
        <circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
        />
        <text
          x={GAUGE_SIZE / 2}
          y={GAUGE_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-[var(--color-text-primary)]"
          fontSize={16}
          fontWeight={700}
        >
          {percent}%
        </text>
      </svg>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        {/* A grade letter reads "Grade B"; a PLE division label ("Division 1") stands alone. */}
        {grade.length <= 4 ? `Grade ${grade}` : grade}
      </span>
    </div>
  );
}

function GradeContributionGauges({ data }: { data: { grade: string; count: number; percent: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-text-muted py-4 text-center">No grades yet.</p>;
  return (
    <div className="flex flex-wrap justify-center gap-6">
      {data.map((d) => (
        <GradeGaugeCard key={d.grade} grade={d.grade} percent={d.percent} count={d.count} />
      ))}
    </div>
  );
}

function PerformerList({
  title,
  items,
  tone,
  className,
  isALevel,
}: {
  title: React.ReactNode;
  items: ReportCardStudent[];
  tone: 'success' | 'error';
  className: string;
  isALevel: boolean;
}) {
  // Primary: a pupil's standing is their PLE aggregate, not a percentage.
  const valueOf = (p: ReportCardStudent): string =>
    p.aggregate !== null && tone === 'success'
      ? `Agg ${p.aggregate}`
      : `${round(standing(p, isALevel).average!)}%`;
  const badgeCls = tone === 'success' ? 'bg-success-bg text-success' : 'bg-error-bg text-error';
  const valueCls = tone === 'success' ? 'text-success' : 'text-error';
  return (
    <Card>
      <p className="text-sm font-bold text-primary-900 mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-2">
          {tone === 'success' ? 'No marks entered yet.' : 'Nobody below 40% — nice.'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((p, i) => (
            <li key={p.studentUserId} className="flex items-center gap-3 py-2.5">
              <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${badgeCls}`}>
                {tone === 'success' ? i + 1 : '!'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-primary-900 truncate">{p.studentName}</span>
                <span className="block text-xs text-text-faint">
                  {className}{p.streamName ? ` ${p.streamName}` : ''}
                </span>
              </span>
              <span className={`text-sm font-extrabold tabular-nums ${valueCls}`}>{valueOf(p)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SubjectRows({ rows }: { rows: ReportCardStudentSubject[] }) {
  return (
    <tbody>
      {rows.map((s) => (
        <tr key={s.subjectId} className="border-t border-border">
          <td className="py-2">
            <div>{s.subjectName}</div>
            {s.hasVariant && s.variantScores && (
              <div className="text-[10.5px] text-text-faint mt-0.5">
                {s.variantScores
                  .map((v) => `${v.name} ${v.isAbsent ? 'Abs' : v.rawScore !== null ? round(v.rawScore) : '—'}`)
                  .join(' · ')}
              </div>
            )}
          </td>
          <td className="py-2 text-center">
            {(s.computedGrade ?? s.bandGrade) ? (
              <span
                className={`inline-flex min-w-6 justify-center px-1.5 py-0.5 rounded-md text-[11.5px] font-extrabold ${
                  GRADE_CHIP[(s.computedGrade ?? s.bandGrade)!] ?? 'bg-bg-muted text-text-muted'
                }`}
              >
                {s.computedGrade ?? s.bandGrade}
              </span>
            ) : (
              <span className="text-text-faint">—</span>
            )}
          </td>
          <td className="py-2 text-right tabular-nums font-bold">
            {s.isAbsent ? <span className="text-text-muted font-normal">Absent</span> : s.rawScore !== null ? round(s.rawScore) : '—'}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default function ReportCardStudioPage() {
  const router = useRouter();
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [examId, setExamId] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [streamId, setStreamId] = useState('');
  const [report, setReport] = useState<ExamReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentKey, setStudentKey] = useState('');

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years', toast.error);
      setYears(list);
      const current = list.find((y) => y.isCurrent) ?? list[0];
      setYearId(current?.id ?? '');
    })();
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void (async () => {
      const [examList, classList] = await Promise.all([
        fetchList<SchoolExam>(`/api/v1/exams?academicYearId=${yearId}`, toast.error),
        fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearId}`, toast.error),
      ]);
      setExamId((prev) => prev || examList[0]?.id || '');
      // Kindergarten sits no exams — its reports live under Kindergarten Progress.
      const examined = classList.filter((c) => c.stagePhase !== 'KINDERGARTEN');
      setClasses(examined);
      setClassId((prev) => prev || examined[0]?.id || '');
    })();
  }, [yearId]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    void (async () => {
      setStreamId('');
      if (!classId || !selectedClass?.hasStreams) {
        setStreams([]);
        return;
      }
      setStreams(await fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`, toast.error));
    })();
  }, [classId, selectedClass?.hasStreams]);

  const load = useCallback(async () => {
    if (!examId || !classId) return;
    setLoading(true);
    const qs = new URLSearchParams({ classId });
    if (streamId) qs.set('streamId', streamId);
    const data = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error);
    setReport(data);
    setStudentKey(data?.students[0]?.studentUserId ?? '');
    setLoading(false);
  }, [examId, classId, streamId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const isALevel = report?.class.phase === 'A_LEVEL';
  const isPrimary = report?.class.phase === 'PRIMARY';
  const student = report?.students.find((s) => s.studentUserId === studentKey) ?? null;

  const scoredStudents = useMemo(
    () => report?.students.filter((s) => standing(s, isALevel ?? false).average !== null) ?? [],
    [report, isALevel],
  );
  const belowPassCount = useMemo(
    () => scoredStudents.filter((s) => standing(s, isALevel ?? false).average! < 40).length,
    [scoredStudents, isALevel],
  );
  const passRate = scoredStudents.length > 0
    ? Math.round(((scoredStudents.length - belowPassCount) / scoredStudents.length) * 100)
    : null;
  const classAverage = useMemo(() => {
    if (scoredStudents.length === 0) return null;
    const sum = scoredStudents.reduce((total, s) => total + standing(s, isALevel ?? false).average!, 0);
    return Math.round(sum / scoredStudents.length);
  }, [scoredStudents, isALevel]);

  // Each scored student's overall grade (principal grade for A-Level, the
  // blended grade for O-Level — same field `standing` already picks), as a
  // share of the class — distinct from `gradeDistribution`, which counts
  // every subject entry rather than one grade per student.
  const gradeContribution = useMemo(() => {
    // Primary: what a parent asks is "which division?", so share by division.
    if (isPrimary && report) {
      const total = report.divisionDistribution.reduce((n, d) => n + d.count, 0);
      return report.divisionDistribution.map((d) => ({
        grade: d.division,
        count: d.count,
        percent: total ? Math.round((d.count / total) * 100) : 0,
      }));
    }
    const counts = new Map<string, number>();
    for (const s of scoredStudents) {
      const grade = standing(s, isALevel ?? false).grade;
      if (!grade) continue;
      counts.set(grade, (counts.get(grade) ?? 0) + 1);
    }
    const total = scoredStudents.length;
    return [...counts.entries()]
      .map(([grade, count]) => ({ grade, count, percent: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => a.grade.localeCompare(b.grade));
  }, [scoredStudents, isALevel, isPrimary, report]);

  const principalSubjects = useMemo(() => report?.subjects.filter((s) => s.role === 'principal') ?? [], [report]);
  const subsidiarySubjects = useMemo(() => report?.subjects.filter((s) => s.role === 'subsidiary') ?? [], [report]);
  const heatmapSubjects = useMemo(
    () => (isALevel ? [...principalSubjects, ...subsidiarySubjects] : report?.subjects ?? []),
    [isALevel, principalSubjects, subsidiarySubjects, report],
  );

  function sheetHref(subjectId: string): string {
    const p = new URLSearchParams({ subject: subjectId, class: classId });
    if (streamId) p.set('stream', streamId);
    return `/school-admin/exams/${examId}/marksheet?${p.toString()}`;
  }

  function openReportCards(params: Record<string, string>) {
    window.open(`/school-admin/exams/${examId}/report-cards?${new URLSearchParams(params).toString()}`, '_blank');
  }

  const selectedStreamName = streams.find((s) => s.id === streamId)?.name;
  const reportCardItems: DropdownMenuItem[] = report
    ? [
        {
          label: student ? `This student — ${student.studentName}` : 'This student',
          icon: FileText,
          disabled: !student,
          onClick: () => {
            if (!student) return;
            openReportCards({ classId, studentId: student.studentUserId, ...(streamId ? { streamId } : {}) });
          },
        },
        {
          label: selectedStreamName ? `This stream — ${selectedStreamName}` : 'Entire class',
          icon: FileText,
          onClick: () => openReportCards({ classId, ...(streamId ? { streamId } : {}) }),
        },
        {
          label: 'Whole school',
          icon: FileText,
          separatorBefore: true,
          onClick: () => openReportCards({ all: '1', yearId }),
        },
      ]
    : [];

  return (
    <div className="max-w-[1320px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent-dark">Report Card Studio</span>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight">
            {report
              ? `${report.exam.name} — ${report.class.name}${report.stream ? ` ${report.stream.name}` : ''}`
              : 'Report Card Studio'}
          </h1>
          <p className="text-sm text-text-muted mt-1 max-w-prose">
            Compiled from marks actually entered for this exam — click any subject below to open its mark sheet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setExamId('');
              setClassId('');
            }}
            className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.yearName}</option>
            ))}
          </select>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
          >
            {classes.length === 0 && <option value="">No classes yet</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.stageName}</option>
            ))}
          </select>
          {selectedClass?.hasStreams && (
            <select
              value={streamId}
              onChange={(e) => setStreamId(e.target.value)}
              className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
            >
              <option value="">All streams</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {report && (
            <DropdownMenu
              items={reportCardItems}
              label="Generate report cards"
              trigger={
                <span className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors">
                  <FileText className="w-4 h-4" aria-hidden /> Report Cards
                </span>
              }
            />
          )}
        </div>
      </div>

      {loading && (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      )}

      {!loading && !examId && (
        <p className="text-sm text-text-muted">This school has no exams yet — create one under Manage Exams.</p>
      )}

      {!loading && examId && !report && (
        <p className="text-sm text-text-muted">Pick a class to compile its report.</p>
      )}

      {!loading && report && report.subjects.length === 0 && (
        <p className="text-sm text-text-muted">No students are enrolled in this class yet.</p>
      )}

      {!loading && report && report.subjects.length > 0 && (
        <>
          <DashboardGrid>
            <StatCard
              icon={TrendingUp}
              label={isALevel ? 'Principal-subject class average' : 'Class average'}
              value={classAverage !== null ? `${classAverage}%` : '—'}
              accent="hero"
            />
            <StatCard
              icon={Trophy}
              label={`Pass rate (${scoredStudents.length} students)`}
              value={passRate !== null ? `${passRate}%` : '—'}
            />
            <StatCard
              icon={Trophy}
              label="Top performer"
              description={
                report.topPerformers[0]
                  ? report.topPerformers[0].aggregate !== null
                    ? `${report.topPerformers[0].studentName} — Aggregate ${report.topPerformers[0].aggregate} (${report.topPerformers[0].division})`
                    : `${report.topPerformers[0].studentName} — ${round(standing(report.topPerformers[0], isALevel ?? false).average!)}%`
                  : 'No marks entered yet'
              }
              accent="gold"
            />
            <StatCard icon={AlertTriangle} label="Students below 40% — needs attention" value={String(belowPassCount)} />
          </DashboardGrid>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-extrabold text-primary-900">Compile board — marks by subject</h2>
              <span className="text-xs text-text-faint">
                {report.subjects.filter((s) => s.submitted).length} of {report.subjects.length} subjects submitted
              </span>
            </div>
            {isALevel ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">Principal subjects</p>
                  <Card className="overflow-x-auto p-0 print:overflow-visible">
                    <SubjectTable rows={principalSubjects} onRowClick={(id) => router.push(sheetHref(id))} />
                  </Card>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">
                    Subsidiary subjects <span className="font-medium normal-case">(General Paper + combination choice)</span>
                  </p>
                  <Card className="overflow-x-auto p-0 print:overflow-visible">
                    <SubjectTable rows={subsidiarySubjects} onRowClick={(id) => router.push(sheetHref(id))} />
                  </Card>
                </div>
              </div>
            ) : (
              <Card className="overflow-x-auto p-0 print:overflow-visible">
                <SubjectTable rows={report.subjects} onRowClick={(id) => router.push(sheetHref(id))} />
              </Card>
            )}
          </section>

          <section>
            <h2 className="text-base font-extrabold text-primary-900 mb-3">Performance analysis</h2>
            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] print:grid-cols-1 gap-4">
              <Card>
                <p className="text-sm font-bold text-primary-900 mb-2">Subject averages</p>
                <SubjectAveragesTable subjects={report.subjects} />
              </Card>

              <div className="flex flex-col gap-4">
                <Card>
                  {isALevel ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-sm font-bold text-primary-900 mb-2">Principal</p>
                        <GradeChart data={report.gradeDistribution} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary-900 mb-2">Subsidiary</p>
                        <GradeChart data={report.subsidiaryGradeDistribution} />
                      </div>
                    </div>
                  ) : isPrimary ? (
                    <>
                      <p className="text-sm font-bold text-primary-900 mb-2">PLE divisions</p>
                      <GradeChart
                        data={report.divisionDistribution.map((d) => ({
                          grade: d.division.replace('Division ', 'Div '),
                          count: d.count,
                        }))}
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-primary-900 mb-2">Grade distribution</p>
                      <GradeChart data={report.gradeDistribution} />
                    </>
                  )}
                </Card>

                {report.streamAverages.length > 0 && (
                  <Card>
                    <p className="text-sm font-bold text-primary-900 mb-2">Average by stream</p>
                    <StreamAveragesChart data={report.streamAverages} />
                  </Card>
                )}
              </div>
            </div>

            <Card className="mt-4">
              <p className="text-sm font-bold text-primary-900 mb-3">
                {isPrimary ? 'Division contribution' : 'Grade contribution'}{' '}
                <span className="font-medium text-text-faint">
                  — share of students per {isPrimary ? 'division' : 'grade'}
                </span>
              </p>
              <GradeContributionGauges data={gradeContribution} />
            </Card>
          </section>

          <section>
            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] print:grid-cols-1 gap-4">
              <div className="flex flex-col gap-4">
                <PerformerList
                  title="Top performers"
                  items={report.topPerformers}
                  tone="success"
                  className={report.class.name}
                  isALevel={isALevel ?? false}
                />
                <PerformerList
                  title={
                    <>
                      Needs attention <span className="font-medium text-text-faint">(below 40%)</span>
                    </>
                  }
                  items={report.needsAttention}
                  tone="error"
                  className={report.class.name}
                  isALevel={isALevel ?? false}
                />
              </div>

              <Card>
                {student ? (
                  <>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="w-11 h-11 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-extrabold text-sm shrink-0">
                          {initials(student.studentName)}
                        </span>
                        <div>
                          <p className="text-[15px] font-extrabold text-primary-900">{student.studentName}</p>
                          <p className="text-xs text-text-muted">
                            {report.class.name}{student.streamName ? ` ${student.streamName}` : ''} · Rank{' '}
                            {student.rank ?? '—'} / {scoredStudents.length}
                          </p>
                        </div>
                      </div>
                      <select
                        value={studentKey}
                        onChange={(e) => setStudentKey(e.target.value)}
                        className="h-8 rounded-lg border border-border-strong bg-white px-2.5 text-xs font-bold text-primary-900"
                        aria-label="Preview a different student's report card"
                      >
                        {report.students.map((s) => (
                          <option key={s.studentUserId} value={s.studentUserId}>
                            {s.studentName}{s.rank ? ` — Rank ${s.rank}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isALevel ? (
                      <div className="grid grid-cols-2 gap-2.5 my-4">
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">
                            {student.principalAverage !== null ? `${round(student.principalAverage)}%` : '—'}
                            {student.principalGrade && (
                              <span className="text-sm font-bold text-text-muted ml-1.5">{student.principalGrade}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">Principal average</p>
                        </div>
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">
                            {student.subsidiaryAverage !== null ? `${round(student.subsidiaryAverage)}%` : '—'}
                            {student.subsidiaryGrade && (
                              <span className="text-sm font-bold text-text-muted ml-1.5">{student.subsidiaryGrade}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">Subsidiary average</p>
                        </div>
                      </div>
                    ) : isPrimary ? (
                      <div className="grid grid-cols-3 gap-2.5 my-4">
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">{student.aggregate ?? '—'}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Aggregate</p>
                        </div>
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900">{student.division ?? '—'}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Division</p>
                        </div>
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">{student.rank ?? '—'}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Position</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2.5 my-4">
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">
                            {student.average !== null ? `${round(student.average)}%` : '—'}
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">Average</p>
                        </div>
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900">{student.overallGrade ?? '—'}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Overall grade</p>
                        </div>
                        <div className="rounded-xl bg-bg-subtle px-3.5 py-3">
                          <p className="text-xl font-extrabold text-primary-900 tabular-nums">{student.rank ?? '—'}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">Position</p>
                        </div>
                      </div>
                    )}

                    {isALevel ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-faint mb-1">Principal subjects</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
                                <th className="pb-2">Subject</th>
                                <th className="pb-2 text-center">Grade</th>
                                <th className="pb-2 text-right">Score</th>
                              </tr>
                            </thead>
                            <SubjectRows rows={student.subjects.filter((s) => s.role === 'principal')} />
                          </table>
                        </div>
                        <div>
                          <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-faint mb-1">Subsidiary subjects</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
                                <th className="pb-2">Subject</th>
                                <th className="pb-2 text-center">Grade</th>
                                <th className="pb-2 text-right">Score</th>
                              </tr>
                            </thead>
                            <SubjectRows rows={student.subjects.filter((s) => s.role === 'subsidiary')} />
                          </table>
                        </div>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
                            <th className="pb-2">Subject</th>
                            <th className="pb-2 text-center">Grade</th>
                            <th className="pb-2 text-right">Score</th>
                          </tr>
                        </thead>
                        <SubjectRows rows={student.subjects} />
                      </table>
                    )}

                    {isALevel ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3.5">
                        {student.principalComment && (
                          <div className="px-3.5 py-3 rounded-xl bg-bg-subtle">
                            <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-faint mb-1">Principal remark</p>
                            <p className="text-sm text-text-secondary italic leading-relaxed">&ldquo;{student.principalComment}&rdquo;</p>
                          </div>
                        )}
                        {student.subsidiaryComment && (
                          <div className="px-3.5 py-3 rounded-xl bg-bg-subtle">
                            <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-faint mb-1">Subsidiary remark</p>
                            <p className="text-sm text-text-secondary italic leading-relaxed">&ldquo;{student.subsidiaryComment}&rdquo;</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      student.overallComment && (
                        <div className="mt-3.5 px-3.5 py-3 rounded-xl bg-bg-subtle">
                          <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-faint mb-1">Grade remark</p>
                          <p className="text-sm text-text-secondary italic leading-relaxed">&ldquo;{student.overallComment}&rdquo;</p>
                        </div>
                      )
                    )}
                  </>
                ) : (
                  <p className="text-sm text-text-muted py-8 text-center">No students to preview.</p>
                )}
              </Card>
            </div>
          </section>

          <section>
            <h2 className="text-base font-extrabold text-primary-900 mb-3">Results heatmap</h2>
            <Card>
              <ResultsHeatmap subjects={heatmapSubjects} students={report.students} />
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
