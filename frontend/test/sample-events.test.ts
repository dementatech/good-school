import { describe, expect, it } from 'vitest';
import { withSampleEvents, withSamplesInRange } from '@/lib/dashboard/sample-events';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const today = new Date('2026-11-04T12:00:00Z');

describe('withSampleEvents', () => {
  it('fills an empty calendar up to the limit, each marked as a sample', () => {
    const events = withSampleEvents([], 4, today, iso);
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.isSample)).toBe(true);
    expect(events[0].eventDate).toBe('2026-11-06');
  });

  it('keeps real events unmarked, sorted among the samples', () => {
    const real = { id: 'r1', title: 'Real', eventDate: '2026-11-05' };
    const events = withSampleEvents([real], 4, today, iso);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual(real);
    expect(events.filter((e) => e.isSample)).toHaveLength(3);
  });

  it('adds nothing once real events reach the limit', () => {
    const real = [1, 2, 3, 4].map((n) => ({ id: `r${n}`, title: 'Real', eventDate: `2026-11-0${n + 4}` }));
    expect(withSampleEvents(real, 4, today, iso)).toEqual(real);
  });
});

describe('withSamplesInRange', () => {
  it('keeps only samples inside the range, including two on one day', () => {
    const events = withSamplesInRange([], '2026-11-10', '2026-11-10', today, iso);
    expect(events.map((e) => e.title).sort()).toEqual(['Mid-term exams begin', 'Mid-term marks due']);
  });
});
