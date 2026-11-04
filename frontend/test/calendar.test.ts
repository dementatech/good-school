import { describe, expect, it } from 'vitest';
import { monthGrid } from '@/lib/dashboard/calendar';

describe('monthGrid', () => {
  it('starts on a Monday and fills whole weeks', () => {
    const grid = monthGrid(2026, 10); // November 2026 starts on a Sunday.
    expect(grid[0].iso).toBe('2026-10-26');
    expect(grid[6]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(grid.length % 7).toBe(0);
    expect(grid[grid.length - 1].iso).toBe('2026-12-06');
  });

  it('marks only the month itself as in-month', () => {
    const inMonth = monthGrid(2027, 1).filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(inMonth[0].iso).toBe('2027-02-01');
  });

  it('crosses the year end', () => {
    const grid = monthGrid(2026, 11);
    expect(grid[grid.length - 1].iso.startsWith('2027-01')).toBe(true);
  });
});
