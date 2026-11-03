import { describe, expect, it } from 'vitest';
import { averageOfResults, isoWeekday, lessonsOn, markSheetsOwed, registersNotTaken, shortClassLabel } from './role-data';

describe('averageOfResults', () => {
  it('leaves out absent and unmarked subjects', () => {
    expect(
      averageOfResults([
        { rawScore: 80, isAbsent: false },
        { rawScore: 60, isAbsent: false },
        { rawScore: 0, isAbsent: true },
        { rawScore: null, isAbsent: false },
      ]),
    ).toBe(70);
  });
  it('is null with nothing scored', () => {
    expect(averageOfResults([])).toBeNull();
  });
});

describe('shortClassLabel', () => {
  it('keeps class numbers and shortens the words', () => {
    expect(['Senior 1', 'Primary 7', 'Baby Class', 'Reception'].map(shortClassLabel)).toEqual(['S1', 'P7', 'BC', 'Rec']);
  });
});

describe('isoWeekday', () => {
  it('counts Sunday as 7 and Monday as 1', () => {
    expect(isoWeekday(new Date(2026, 10, 8))).toBe(7);
    expect(isoWeekday(new Date(2026, 10, 9))).toBe(1);
  });
});

describe('lessonsOn', () => {
  const periods = {
    SECONDARY: [
      { id: 'p1', label: 'Period 1', startTime: '08:00', endTime: '08:40' },
      { id: 'p2', label: 'Period 2', startTime: '08:40', endTime: '09:20' },
    ],
  };
  const slot = { className: 'Senior 1', streamName: 'East', subjectName: 'English', activity: null, room: null };
  it('keeps the one day, in time order, and names the stream', () => {
    const lessons = lessonsOn(
      2,
      [
        { ...slot, id: 'late', dayOfWeek: 2, periodId: 'p2' },
        { ...slot, id: 'early', dayOfWeek: 2, periodId: 'p1' },
        { ...slot, id: 'other', dayOfWeek: 3, periodId: 'p1' },
        { ...slot, id: 'lost', dayOfWeek: 2, periodId: 'gone' },
      ],
      periods,
    );
    expect(lessons.map((l) => l.id)).toEqual(['early', 'late']);
    expect(lessons[0]).toMatchObject({ classLabel: 'Senior 1 East', time: '08:00 to 08:40' });
  });
});

describe('markSheetsOwed', () => {
  it('counts unsubmitted sheets only in exams open for marks', () => {
    const exam = { examId: 'e', examName: 'E', termName: 'T', marksDueOn: null };
    expect(
      markSheetsOwed([
        { ...exam, marksEntryOpen: true, slots: [{ submitted: true }, { submitted: false }] },
        { ...exam, marksEntryOpen: false, slots: [{ submitted: false }] },
      ]),
    ).toBe(1);
  });
});

describe('registersNotTaken', () => {
  it('ignores empty classes and started registers', () => {
    const c = { classId: 'c', className: 'C', classTeacherName: null };
    const rows = registersNotTaken([
      { ...c, classId: 'todo', pupils: 5, marked: 0 },
      { ...c, classId: 'done', pupils: 5, marked: 5 },
      { ...c, classId: 'empty', pupils: 0, marked: 0 },
    ]);
    expect(rows.map((r) => r.classId)).toEqual(['todo']);
  });
});
