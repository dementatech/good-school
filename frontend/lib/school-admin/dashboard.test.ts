import { describe, expect, it } from 'vitest';
import {
  latestPublishedExam,
  localIsoDate,
  ongoingExams,
  ordinal,
  overallAttendanceRate,
  pickCurrentTerm,
  pickNotice,
  summariseMarks,
  type AttendanceClassSummary,
  type DashboardExam,
} from './dashboard';

const exam = (over: Partial<DashboardExam>): DashboardExam => ({
  id: 'e',
  name: 'Exam',
  termName: 'Term 3',
  startsOn: '2026-11-02',
  endsOn: '2026-11-02',
  marksDueOn: '2026-11-09',
  status: 'active',
  marksEntryOpen: false,
  publishedAt: null,
  ...over,
});

const attendance = (over: Partial<AttendanceClassSummary>): AttendanceClassSummary => ({
  classId: 'c',
  className: 'C',
  daysTaken: 1,
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  rate: 0,
  ...over,
});

describe('localIsoDate', () => {
  it('uses the local calendar day, zero padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 1, 30))).toBe('2026-01-05');
  });
});

describe('pickCurrentTerm', () => {
  const terms = [
    { id: '1', name: 'Term 1', startDate: '2026-02-02', endDate: '2026-05-01' },
    { id: '2', name: 'Term 2', startDate: '2026-05-25', endDate: '2026-08-14' },
  ];
  it('finds the running term', () => {
    expect(pickCurrentTerm(terms, '2026-03-01')?.id).toBe('1');
  });
  it('keeps the last term during a holiday', () => {
    expect(pickCurrentTerm(terms, '2026-05-10')?.id).toBe('1');
  });
  it('has nothing before the first term', () => {
    expect(pickCurrentTerm(terms, '2026-01-01')).toBeNull();
  });
});

describe('overallAttendanceRate', () => {
  it('pools classes rather than averaging their rates', () => {
    const rate = overallAttendanceRate([
      attendance({ present: 90, absent: 10 }),
      attendance({ present: 1, absent: 9 }),
    ]);
    expect(rate).toBe(82.7);
  });
  it('counts late as attending, like the per-class rate', () => {
    expect(overallAttendanceRate([attendance({ present: 7466, late: 129, absent: 332, excused: 73 })])).toBe(94.9);
  });
  it('is null when no register was taken', () => {
    expect(overallAttendanceRate([])).toBeNull();
  });
});

describe('summariseMarks', () => {
  it('lists each teacher who owes marks once', () => {
    const summary = summariseMarks([
      { rosterCount: 1, enteredCount: 1, submitted: true, teacherName: 'Done' },
      { rosterCount: 1, enteredCount: 0, submitted: false, teacherName: 'Ann' },
      { rosterCount: 1, enteredCount: 0, submitted: false, teacherName: 'Ann' },
      { rosterCount: 1, enteredCount: 0, submitted: false, teacherName: null },
    ]);
    expect(summary).toMatchObject({ total: 4, submitted: 1, pending: 3, percent: 25, pendingTeachers: ['Ann'] });
  });
  it('does not divide by zero', () => {
    expect(summariseMarks([]).percent).toBe(0);
  });
});

describe('exam selection', () => {
  it('sorts ongoing exams soonest first and drops closed ones', () => {
    const rows = ongoingExams([
      exam({ id: 'late', startsOn: '2026-11-23' }),
      exam({ id: 'soon', startsOn: '2026-11-02' }),
      exam({ id: 'old', status: 'closed' }),
    ]);
    expect(rows.map((e) => e.id)).toEqual(['soon', 'late']);
  });
  it('finds the most recently published exam', () => {
    const latest = latestPublishedExam([
      exam({ id: 'a', publishedAt: '2026-04-29T15:00:00.000Z' }),
      exam({ id: 'b', publishedAt: '2026-08-12T15:00:00.000Z' }),
      exam({ id: 'c' }),
    ]);
    expect(latest?.id).toBe('b');
  });
});

describe('pickNotice', () => {
  const today = '2026-11-03';
  const marks = (total: number, submitted: number) => ({
    total,
    submitted,
    pending: total - submitted,
    percent: 0,
    pendingTeachers: [],
  });

  it('leads with outstanding mark sheets', () => {
    const notice = pickNotice([exam({ id: 'm', marksEntryOpen: true })], { m: marks(252, 125) }, today);
    expect(notice?.message).toBe('127 of 252 mark sheets are still to be submitted. Marks are due on 9 Nov 2026.');
  });
  it('says when marks are overdue', () => {
    const notice = pickNotice(
      [exam({ id: 'm', marksEntryOpen: true, marksDueOn: '2026-11-01' })],
      { m: marks(2, 1) },
      today,
    );
    expect(notice?.message).toContain('were due on 1 Nov 2026');
  });
  it('says when every sheet is in', () => {
    const notice = pickNotice([exam({ id: 'm', marksEntryOpen: true })], { m: marks(2, 2) }, today);
    expect(notice?.message).toBe('All 2 mark sheets are in and ready to review.');
  });
  it('falls back to the next exam', () => {
    const notice = pickNotice([exam({ id: 'n', startsOn: '2026-11-23' })], {}, today);
    expect(notice?.message).toBe('This exam starts on 23 Nov 2026.');
  });
  it('stays quiet when nothing needs attention', () => {
    expect(pickNotice([exam({ status: 'closed' })], {}, today)).toBeNull();
  });
});

describe('ordinal', () => {
  it('handles the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
  });
});
