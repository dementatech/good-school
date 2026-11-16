import { describe, expect, it } from 'vitest';
import { defaultReportCardFields } from '@/components/admin/report-cards/ReportCardSheet';
import { DEFAULT_RULES, type ExamRule } from '@/components/admin/report-cards/templates';
import { generateSampleReport, sampleExamColumns } from './sample-report';

const noBands = { primaryBands: [], nurseryBands: [], oLevelBands: [], principalBands: [], subsidiaryBands: [] };
const make = (level: 'O_LEVEL' | 'A_LEVEL' | 'PRIMARY' | 'KINDERGARTEN', seed: number, examRule: ExamRule = DEFAULT_RULES.exams) =>
  generateSampleReport({
    level,
    seed,
    bands: noBands,
    examRule,
    fields: defaultReportCardFields(level === 'PRIMARY' ? 'PRIMARY' : level === 'KINDERGARTEN' ? 'KINDERGARTEN' : 'SECONDARY'),
    showPositions: true,
  }).sheet;

describe('sample report', () => {
  it('is the same learner for the same seed, and another for another seed', () => {
    expect(make('O_LEVEL', 7)).toEqual(make('O_LEVEL', 7));
    expect(make('O_LEVEL', 7).student.studentName).not.toEqual(make('O_LEVEL', 8).student.studentName);
  });

  it('gives an O-Level learner the core subjects with their UCE codes', () => {
    const { subjects } = make('O_LEVEL', 3).student;
    const codes = subjects.map((s) => s.paperCode);
    for (const core of ['112', '456', '553', '545', '535', '241', '273']) expect(codes).toContain(core);
    expect(subjects.find((s) => s.paperCode === '112')?.subjectReportName).toBe('English');
  });

  it('works out the average and overall grade from the scores', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { student } = make('O_LEVEL', seed);
      const scored = student.subjects.filter((s) => !s.isAbsent && s.rawScore !== null);
      const avg = scored.reduce((sum, s) => sum + s.rawScore!, 0) / scored.length;
      expect(student.average).toBeCloseTo(avg, 1);
      for (const s of student.subjects) if (s.rawScore !== null) expect(s.rawScore).toBeGreaterThanOrEqual(0);
      expect(student.overallGrade).toMatch(/^[A-E]$/);
      expect(student.rank).toBeGreaterThanOrEqual(1);
      expect(student.rank!).toBeLessThanOrEqual(make('O_LEVEL', seed).totalInClass);
    }
  });

  it('shows the term exams side by side, the opened one among them', () => {
    const sheet = make('O_LEVEL', 5, { mode: 'term', codes: [], combine: false, weights: {} });
    expect(sheet.mode).toBe('side_by_side');
    expect(sheet.compared?.map((c) => c.label)).toEqual(['BOT', 'MID', 'EOT']);
    expect(sheet.compared?.filter((c) => c.isCurrent).map((c) => c.label)).toEqual(['EOT']);
    expect(sheet.student.subjects[0].history).toHaveLength(3);
  });

  it('combines exams with the rule weights', () => {
    const sheet = make('O_LEVEL', 9, { mode: 'codes', codes: ['MID', 'EOT'], combine: true, weights: { MID: 40, EOT: 60 } });
    expect(sheet.mode).toBe('combined');
    expect(sheet.compared?.map((c) => c.weightPercent)).toEqual([40, 60]);
    const s = sheet.student.subjects.find((x) => x.history?.every((h) => h.rawScore !== null))!;
    const [mid, eot] = s.history!.map((h) => h.rawScore!);
    expect(s.rawScore).toBeCloseTo(mid * 0.4 + eot * 0.6, 1);
  });

  it('gives a Primary pupil PLE points, an aggregate and a division', () => {
    for (let seed = 1; seed < 15; seed++) {
      const { student } = make('PRIMARY', seed);
      const points = student.subjects.filter((s) => s.isExaminable).map((s) => s.points);
      if (points.every((p) => p !== null)) {
        expect(student.aggregate).toBe(points.reduce((a, b) => a! + b!, 0));
        expect(student.division).toBeTruthy();
      }
    }
  });

  it('gives an A-Level learner principal and subsidiary results', () => {
    const { student } = make('A_LEVEL', 4);
    expect(student.subjects.filter((s) => s.role === 'principal')).toHaveLength(3);
    expect(student.subjects.some((s) => s.paperCode === 'S101')).toBe(true);
    expect(student.principalAverage).not.toBeNull();
  });

  it('maps exam rules to sample columns', () => {
    expect(sampleExamColumns(DEFAULT_RULES.exams)).toEqual({ labels: ['MID'], current: 'MID' });
    expect(sampleExamColumns({ mode: 'codes', codes: ['BOT', 'EOT'], combine: false, weights: {} })).toEqual({ labels: ['BOT', 'EOT'], current: 'EOT' });
  });
});

describe('sample learner identity', () => {
  it('stays the same learner when the exam rule changes', () => {
    const one = make('O_LEVEL', 11);
    const term = make('O_LEVEL', 11, { mode: 'term', codes: [], combine: true, weights: {} });
    expect(term.student.studentName).toBe(one.student.studentName);
    expect(term.klass.name).toBe(one.klass.name);
  });
});
