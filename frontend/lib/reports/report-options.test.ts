import { describe, expect, it } from 'vitest';
import { defaultExam, defaultOtherExams, reportQueryParams } from './report-options';

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
  it('adds nothing for one exam', () => {
    expect(reportQueryParams({ ...base, type: 'single' })).toEqual({});
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
