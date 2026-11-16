import { describe, expect, it } from 'vitest';
import { defaultExam, defaultOtherExams, examRuleParams, reportQueryParams } from './report-options';

const exams = [
  { id: 'eot3', termId: 't3', startsOn: '2026-11-23' },
  { id: 'mid3', termId: 't3', startsOn: '2026-11-02' },
  { id: 'bot3', termId: 't3', startsOn: '2026-09-08' },
  { id: 'eot2', termId: 't2', startsOn: '2026-08-03' },
];
const today = '2026-11-03';

describe('defaultExam', () => {
  it('skips an exam that has not started', () => {
    expect(defaultExam(exams, today)?.id).toBe('mid3');
  });
  it('falls back to what exists when nothing has started', () => {
    expect(defaultExam([exams[0]], today)?.id).toBe('eot3');
  });
  it('copes with no exams', () => {
    expect(defaultExam([], today)).toBeNull();
  });
});

describe('defaultOtherExams', () => {
  it('stays in the term and leaves out exams yet to start', () => {
    expect(defaultOtherExams(exams, 'mid3', today)).toEqual(['bot3']);
  });
});

describe('reportQueryParams', () => {
  const base = { examId: 'mid3', otherExamIds: ['bot3'], weights: {} };
  it('asks for one exam explicitly, so the template rule is not applied', () => {
    expect(reportQueryParams({ ...base, type: 'single' })).toEqual({ mode: 'single' });
  });
  it('leaves the choice to the template when asked to', () => {
    expect(reportQueryParams({ ...base, type: 'template' })).toEqual({});
  });
  it('leaves the opened exam out of the side-by-side columns', () => {
    expect(reportQueryParams({ ...base, type: 'side_by_side' })).toEqual({ mode: 'side_by_side', examIds: 'bot3' });
  });
  it('includes the opened exam when combining', () => {
    expect(reportQueryParams({ ...base, type: 'combined_equal' })).toEqual({ mode: 'combined', examIds: 'mid3,bot3' });
  });
  it('keeps weights in the same order as the exams', () => {
    expect(reportQueryParams({ ...base, type: 'combined_custom', weights: { bot3: 40, mid3: 60 } })).toEqual({
      mode: 'combined',
      examIds: 'mid3,bot3',
      weights: '60,40',
    });
  });
  it('is incomplete with no other exam chosen', () => {
    expect(reportQueryParams({ ...base, otherExamIds: [], type: 'combined_equal' })).toBeNull();
  });
  it('is incomplete when every share is zero', () => {
    expect(reportQueryParams({ ...base, type: 'combined_custom', weights: { mid3: 0, bot3: 0 } })).toBeNull();
  });
});

describe('examRuleParams', () => {
  const exams = [
    { id: 'bot', termId: 't3', startsOn: '2026-09-10', examCode: 'BOT' },
    { id: 'mid', termId: 't3', startsOn: '2026-10-14', examCode: 'MID' },
    { id: 'eot', termId: 't3', startsOn: '2026-11-20', examCode: 'EOT' },
    { id: 'old', termId: 't2', startsOn: '2026-06-01', examCode: 'EOT' },
  ];
  const today = '2026-11-17';
  const rule = (r: Partial<Parameters<typeof examRuleParams>[0]>) => ({ mode: 'opened' as const, codes: [], combine: false, weights: {}, ...r });

  it('shows just the opened exam by default', () => {
    expect(examRuleParams(rule({}), 'mid', exams, today)).toEqual({ mode: 'single' });
  });
  it("puts the term's started exams beside the opened one", () => {
    expect(examRuleParams(rule({ mode: 'term' }), 'mid', exams, today)).toEqual({ mode: 'side_by_side', examIds: 'bot' });
  });
  it('picks exams by code and combines them with weights, opened exam first', () => {
    expect(examRuleParams(rule({ mode: 'codes', codes: ['BOT', 'MID'], combine: true, weights: { BOT: 30, MID: 70 } }), 'mid', exams, today)).toEqual({
      mode: 'combined',
      examIds: 'mid,bot',
      weights: '70,30',
    });
  });
  it('stays on one exam when the rule finds no others', () => {
    expect(examRuleParams(rule({ mode: 'codes', codes: ['EOT'] }), 'mid', exams, today)).toEqual({ mode: 'single' });
  });
});
