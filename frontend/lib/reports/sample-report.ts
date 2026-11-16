import type { SchoolLevel } from '@/lib/levels';
import type {
  CardBands,
  ComparedExam,
  GradeBand,
  GradeDivision,
  ReportCardFields,
  ReportCardStudent,
  ReportCardStudentSubject,
  SchoolInfo,
  Sheet,
} from '@/components/admin/report-cards/ReportCardSheet';
import type { ExamRule } from '@/components/admin/report-cards/templates';

/**
 * A believable made-up learner for the report designer: real-looking names,
 * the subjects (with UCE / UNEB codes) of the chosen level, BOT / MID / EOT
 * scores that drift the way a real learner's do, and grades, comments,
 * points and position worked out from the school's own grading bands. Seeded,
 * so the same seed always gives the same learner and "Shuffle" just picks
 * another seed. Nothing here is ever saved or printed for a real learner.
 */

export interface SampleOptions {
  level: SchoolLevel;
  seed: number;
  bands: CardBands;
  /** Which exams the template's rule puts on the card. */
  examRule: ExamRule;
  fields: ReportCardFields;
  showPositions: boolean;
  /** Some subjects marked absent. */
  absences?: boolean;
  /** O-Level: how many subjects the learner takes (7–14). */
  subjectCount?: number;
}

export interface SampleReport {
  sheet: Sheet;
  schoolInfo: SchoolInfo;
}

// ─── Seeded randomness ──────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    /** Roughly normal, from the average of three draws. */
    around: (mean: number, spread: number) => mean + ((next() + next() + next()) / 3 - 0.5) * 2 * spread,
    shuffle: <T,>(list: readonly T[]): T[] => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ─── What a learner can be ──────────────────────────────────────────────────

const FIRST_NAMES = [
  'Nakato', 'Babirye', 'Namuli', 'Achieng', 'Akello', 'Nabukenya', 'Atim', 'Nansubuga', 'Kisakye', 'Auma',
  'Mugisha', 'Ssemwanga', 'Okello', 'Kato', 'Waiswa', 'Ochieng', 'Tumusiime', 'Byaruhanga', 'Opio', 'Lubega',
];
const OTHER_NAMES = ['Sarah', 'Brian', 'Esther', 'Joseph', 'Grace', 'Isaac', 'Mercy', 'Daniel', 'Patience', 'Ronald', 'Faith', 'Aksam', 'Rahman', 'Joan'];
const SURNAMES = ['Kiseeka', 'Katende', 'Nsubuga', 'Mukasa', 'Ouma', 'Asiimwe', 'Kizza', 'Namutebi', 'Ssekandi', 'Odongo', 'Tumwine', 'Mutebi'];
const STREAMS = ['Central', 'East', 'West', 'North', 'South', 'Blue', 'Red'];
const TEACHERS = ['N.J.', 'M.I.', 'N.P.', 'K.B.', 'E.P.', 'S.O.', 'M.D.', 'N.C.', 'A.R.', 'T.K.', 'O.G.', 'B.L.'];

interface SubjectDef {
  name: string;
  code: string | null;
  report: string;
  role?: 'principal' | 'subsidiary';
  examinable?: boolean;
  /** Always taken. */
  core?: boolean;
}

const O_LEVEL: SubjectDef[] = [
  { name: 'English Language', code: '112', report: 'English', core: true },
  { name: 'Mathematics', code: '456', report: 'Maths', core: true },
  { name: 'Biology', code: '553', report: 'Biology', core: true },
  { name: 'Chemistry', code: '545', report: 'Chemistry', core: true },
  { name: 'Physics', code: '535', report: 'Physics', core: true },
  { name: 'History & Political Education', code: '241', report: 'History', core: true },
  { name: 'Geography', code: '273', report: 'Geography', core: true },
  { name: 'Entrepreneurship', code: '845', report: 'Entrepreneurship' },
  { name: 'Christian Religious Education', code: '223', report: 'CRE' },
  { name: 'Kiswahili', code: '336', report: 'Kiswahili' },
  { name: 'Information & Communication Technology', code: '840', report: 'ICT' },
  { name: 'Luganda', code: '335', report: 'Luganda' },
  { name: 'Agriculture', code: '527', report: 'Agriculture' },
  { name: 'Literature in English', code: '208', report: 'Literature' },
  { name: 'Physical Education', code: '555', report: 'PE' },
  { name: 'Art & Design', code: '612', report: 'Art' },
  { name: 'Nutrition & Food Technology', code: '662', report: 'Nutrition' },
];
const A_LEVEL_COMBINATIONS: SubjectDef[][] = [
  [
    { name: 'Physics', code: 'P510', report: 'Physics' },
    { name: 'Chemistry', code: 'P525', report: 'Chemistry' },
    { name: 'Mathematics', code: 'P425', report: 'Maths' },
    { name: 'Subsidiary ICT', code: 'S850', report: 'Sub ICT', role: 'subsidiary' },
  ],
  [
    { name: 'History', code: 'P210', report: 'History' },
    { name: 'Economics', code: 'P220', report: 'Economics' },
    { name: 'Geography', code: 'P250', report: 'Geography' },
    { name: 'Subsidiary Mathematics', code: 'S475', report: 'Sub Maths', role: 'subsidiary' },
  ],
  [
    { name: 'Biology', code: 'P530', report: 'Biology' },
    { name: 'Chemistry', code: 'P525', report: 'Chemistry' },
    { name: 'Agriculture', code: 'P515', report: 'Agriculture' },
    { name: 'Subsidiary Mathematics', code: 'S475', report: 'Sub Maths', role: 'subsidiary' },
  ],
];
const GENERAL_PAPER: SubjectDef = { name: 'General Paper', code: 'S101', report: 'GP', role: 'subsidiary' };
const PRIMARY: SubjectDef[] = [
  { name: 'English', code: null, report: 'English', examinable: true },
  { name: 'Mathematics', code: null, report: 'Maths', examinable: true },
  { name: 'Integrated Science', code: null, report: 'Science', examinable: true },
  { name: 'Social Studies', code: null, report: 'SST', examinable: true },
  { name: 'Luganda', code: null, report: 'Luganda', examinable: false },
  { name: 'Religious Education', code: null, report: 'RE', examinable: false },
];
const NURSERY: SubjectDef[] = [
  { name: 'Language Development', code: null, report: 'Language' },
  { name: 'Number Work', code: null, report: 'Numbers' },
  { name: 'Reading', code: null, report: 'Reading' },
  { name: 'Writing', code: null, report: 'Writing' },
  { name: 'Creative Arts', code: null, report: 'Arts' },
];

// Used only when the school hasn't chosen a scheme for the level yet.
const FALLBACK_BANDS: GradeBand[] = [
  { label: 'E', minPct: 0, maxPct: 49.99, points: 1, comment: 'Weak' },
  { label: 'D', minPct: 50, maxPct: 59.99, points: 2, comment: 'Fair' },
  { label: 'C', minPct: 60, maxPct: 69.99, points: 3, comment: 'Good' },
  { label: 'B', minPct: 70, maxPct: 79.99, points: 4, comment: 'Very Good' },
  { label: 'A', minPct: 80, maxPct: 100, points: 5, comment: 'Excellent' },
];
const FALLBACK_PLE: GradeBand[] = [
  { label: 'F9', minPct: 0, maxPct: 39.99, points: 9, comment: 'Fail' },
  { label: 'P8', minPct: 40, maxPct: 44.99, points: 8, comment: 'Pass' },
  { label: 'P7', minPct: 45, maxPct: 49.99, points: 7, comment: 'Pass' },
  { label: 'C6', minPct: 50, maxPct: 54.99, points: 6, comment: 'Credit' },
  { label: 'C5', minPct: 55, maxPct: 59.99, points: 5, comment: 'Credit' },
  { label: 'C4', minPct: 60, maxPct: 69.99, points: 4, comment: 'Good' },
  { label: 'C3', minPct: 70, maxPct: 79.99, points: 3, comment: 'Very Good' },
  { label: 'D2', minPct: 80, maxPct: 89.99, points: 2, comment: 'Distinction' },
  { label: 'D1', minPct: 90, maxPct: 100, points: 1, comment: 'Excellent' },
];
const FALLBACK_SUBSIDIARY: GradeBand[] = [
  { label: 'Fail', minPct: 0, maxPct: 49.99, points: 0, comment: 'Subsidiary Fail' },
  { label: 'Pass', minPct: 50, maxPct: 100, points: 1, comment: 'Subsidiary Pass' },
];
const DIVISIONS: GradeDivision[] = [
  { label: 'Division 1', minAggregate: 4, maxAggregate: 12 },
  { label: 'Division 2', minAggregate: 13, maxAggregate: 23 },
  { label: 'Division 3', minAggregate: 24, maxAggregate: 29 },
  { label: 'Division 4', minAggregate: 30, maxAggregate: 34 },
  { label: 'U', minAggregate: 35, maxAggregate: 36 },
];

const CLASS_NAME: Record<SchoolLevel, string[]> = {
  KINDERGARTEN: ['Baby Class', 'Middle Class', 'Top Class'],
  PRIMARY: ['Primary 5', 'Primary 6', 'Primary 7'],
  O_LEVEL: ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4'],
  A_LEVEL: ['Senior 5', 'Senior 6'],
};

/** The bands a level grades with: the school's, or a standard set. */
export function sampleBands(level: SchoolLevel, bands: CardBands): { main: GradeBand[]; subsidiary: GradeBand[] } {
  const or = (b: GradeBand[], fallback: GradeBand[]) => (b.length > 0 ? b : fallback);
  switch (level) {
    case 'PRIMARY':
      return { main: or(bands.primaryBands, FALLBACK_PLE), subsidiary: [] };
    case 'KINDERGARTEN':
      return { main: or(bands.nurseryBands, FALLBACK_BANDS), subsidiary: [] };
    case 'A_LEVEL':
      return { main: or(bands.principalBands, FALLBACK_BANDS), subsidiary: or(bands.subsidiaryBands, FALLBACK_SUBSIDIARY) };
    default:
      return { main: or(bands.oLevelBands, FALLBACK_BANDS), subsidiary: [] };
  }
}

const bandOf = (bands: GradeBand[], score: number | null) =>
  score === null ? null : bands.find((b) => score >= b.minPct && score <= b.maxPct) ?? null;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The exam columns a rule produces on a sample card, in date order. */
export function sampleExamColumns(rule: ExamRule): { labels: string[]; current: string } {
  const term = ['BOT', 'MID', 'EOT'];
  if (rule.mode === 'opened') return { labels: ['MID'], current: 'MID' };
  const labels = rule.mode === 'term' ? term : rule.codes.length > 0 ? rule.codes : ['MID'];
  // Open the sample from the latest exam, the way an end-of-term card is.
  return { labels, current: labels[labels.length - 1] };
}

export function generateSampleReport(options: SampleOptions): SampleReport {
  const r = rng(options.seed);
  // Who the learner is comes from its own stream of numbers, so changing a
  // rule (which draws more or fewer scores) keeps the same learner.
  const who = rng(options.seed * 7919 + 13);
  const firstName = who.pick(FIRST_NAMES);
  const studentName = `${who.pick(SURNAMES)} ${firstName} ${who.pick(OTHER_NAMES)}`;
  const systemId = `S26${String(who.int(1000, 2999))}`;
  const streamName = who.pick(STREAMS);
  const className = who.pick(CLASS_NAME[options.level]);
  const classSize = who.int(38, 96);
  const totalDays = who.int(55, 64);
  const absentDays = who.int(0, 8);
  const { level, examRule, fields, showPositions } = options;
  const { main, subsidiary } = sampleBands(level, options.bands);

  // Subjects.
  let defs: SubjectDef[];
  if (level === 'O_LEVEL') {
    const count = Math.min(Math.max(options.subjectCount ?? r.int(9, 12), 7), 14);
    const core = O_LEVEL.filter((s) => s.core);
    defs = [...core, ...r.shuffle(O_LEVEL.filter((s) => !s.core))].slice(0, count);
  } else if (level === 'A_LEVEL') {
    defs = [...r.pick(A_LEVEL_COMBINATIONS), GENERAL_PAPER];
  } else if (level === 'PRIMARY') {
    defs = PRIMARY;
  } else {
    defs = NURSERY;
  }

  // Exams on the card.
  const { labels, current } = sampleExamColumns(examRule);
  const multi = labels.length > 1;
  const combined = multi && examRule.combine;
  const examIds = labels.map((l) => `sample-${l.toLowerCase()}`);
  const totalWeight = labels.reduce((sum, l) => sum + (examRule.weights[l] ?? 1), 0) || 1;
  const compared: ComparedExam[] = !multi
    ? []
    : labels.map((label, i) => ({
        id: examIds[i],
        label,
        name: label,
        weightPercent: combined ? Math.round(((examRule.weights[label] ?? 1) / totalWeight) * 100) : null,
        isCurrent: !combined && label === current,
      }));

  // A learner has an overall ability, each subject leans a little either way,
  // and marks drift across the term.
  const ability = r.around(62, 22);
  const trend = r.around(0, 6);
  const subjects: ReportCardStudentSubject[] = defs.map((def, i) => {
    const lean = r.around(0, 14);
    const absentIn = new Set<number>();
    if (options.absences !== false && r.next() < 0.08) absentIn.add(r.int(0, labels.length - 1));
    const scores = labels.map((_, j) => {
      if (absentIn.has(j)) return null;
      const score = ability + lean + trend * (j - labels.length + 1) + r.around(0, 7);
      return Math.max(3, Math.min(98, Math.round(score)));
    });
    const history = labels.map((_, j) => ({ examId: examIds[j], rawScore: scores[j], isAbsent: absentIn.has(j) }));
    const currentIndex = labels.indexOf(current);
    let rawScore: number | null;
    let isAbsent: boolean;
    if (combined) {
      const sat = labels.map((l, j) => ({ w: examRule.weights[l] ?? 1, s: scores[j] })).filter((x) => x.s !== null);
      const w = sat.reduce((sum, x) => sum + x.w, 0);
      rawScore = w > 0 ? round2(sat.reduce((sum, x) => sum + x.s! * x.w, 0) / w) : null;
      isAbsent = sat.length === 0;
    } else {
      rawScore = scores[currentIndex];
      isAbsent = absentIn.has(currentIndex);
    }
    const bands = def.role === 'subsidiary' ? subsidiary : main;
    const band = isAbsent ? null : bandOf(bands, rawScore);
    const hasPapers = level !== 'PRIMARY' && level !== 'KINDERGARTEN' && ['553', '545', '535', 'P510', 'P525', 'P530'].includes(def.code ?? '');
    return {
      subjectId: `sample-subject-${i}`,
      subjectName: def.name,
      subjectReportName: def.report,
      paperCode: def.code,
      role: def.role ?? 'principal',
      hasVariant: hasPapers && !combined,
      variantScores:
        hasPapers && !combined && rawScore !== null
          ? [
              { name: 'Theory', rawScore: Math.max(0, Math.min(100, rawScore + r.int(-6, 6))), isAbsent: false },
              { name: 'Practical', rawScore: Math.max(0, Math.min(100, rawScore + r.int(-10, 10))), isAbsent: false },
            ]
          : undefined,
      rawScore: isAbsent ? null : rawScore,
      mark: hasPapers || combined || isAbsent ? null : rawScore,
      maxMark: 100,
      isAbsent,
      computedGrade: null,
      isExaminable: def.examinable ?? true,
      points: level === 'PRIMARY' && def.examinable ? band?.points ?? null : null,
      teacherInitials: r.pick(TEACHERS),
      history: multi && !combined ? history : combined ? history : [],
    };
  });

  const averageOf = (list: ReportCardStudentSubject[]) => {
    const scored = list.filter((s) => !s.isAbsent && s.rawScore !== null);
    return scored.length ? round2(scored.reduce((sum, s) => sum + s.rawScore!, 0) / scored.length) : null;
  };
  const isALevel = level === 'A_LEVEL';
  const average = averageOf(subjects);
  const principalAverage = isALevel ? averageOf(subjects.filter((s) => s.role === 'principal')) : null;
  const subsidiaryAverage = isALevel ? averageOf(subjects.filter((s) => s.role === 'subsidiary')) : null;
  const overall = bandOf(main, isALevel ? null : average);
  const principalBand = bandOf(main, principalAverage);
  const subsidiaryBand = bandOf(subsidiary, subsidiaryAverage);

  let aggregate: number | null = null;
  let division: string | null = null;
  if (level === 'PRIMARY') {
    const points = subjects.filter((s) => s.isExaminable && s.points !== null).map((s) => s.points!);
    if (points.length === 4) {
      aggregate = points.reduce((a, b) => a + b, 0);
      division = DIVISIONS.find((d) => aggregate! >= d.minAggregate && aggregate! <= d.maxAggregate)?.label ?? null;
    }
  }

  const rank = Math.max(1, Math.min(classSize, Math.round(((100 - (average ?? 50)) / 100) * classSize) + r.int(-3, 3)));
  const student: ReportCardStudent = {
    studentUserId: `sample-${options.seed}`,
    studentName,
    systemId,
    streamId: null,
    streamName,
    photoUrl: null,
    attendance: { present: totalDays - absentDays, total: totalDays },
    average: isALevel ? null : average,
    overallGrade: overall?.label ?? null,
    overallComment: overall?.comment ?? null,
    principalAverage,
    principalGrade: principalBand?.label ?? null,
    principalComment: principalBand?.comment ?? null,
    subsidiaryAverage,
    subsidiaryGrade: subsidiaryBand?.label ?? null,
    subsidiaryComment: subsidiaryBand?.comment ?? null,
    aggregate,
    division,
    rank,
    subjects,
  };

  const examName = combined ? `Combined report: ${compared.map((c) => `${c.label} ${c.weightPercent}%`).join(', ')}` : { BOT: 'Beginning of Term Exams', MID: 'Mid-Term Exams', EOT: 'End of Term Exams' }[current] ?? `${current} Exams`;
  const sheet: Sheet = {
    student,
    exam: { id: 'sample', name: examName, label: current, termId: 'sample-term', termName: 'Term 3', publishedAt: null },
    klass: { id: 'sample-class', name: className, phase: level },
    stream: null,
    aggregation: level === 'PRIMARY' ? { subjectCount: 4, divisions: DIVISIONS } : null,
    totalInClass: classSize,
    showPositions,
    fields,
    nurseryRatings:
      level === 'KINDERGARTEN'
        ? {
            areas: [
              { id: 'a1', name: 'Relating with others' },
              { id: 'a2', name: 'Using language to communicate' },
              { id: 'a3', name: 'Exploring the environment' },
            ],
            ratings: Object.fromEntries(['a1', 'a2', 'a3'].map((id) => [id, { rating: r.pick(['emerging', 'developing', 'proficient']), comment: null }])),
          }
        : null,
    mode: !multi ? 'single' : combined ? 'combined' : 'side_by_side',
    compared,
  };
  return {
    sheet,
    schoolInfo: { name: 'Sample School', district: 'Kampala', address: 'Plot 1, School Road', logoUrl: null },
  };
}
