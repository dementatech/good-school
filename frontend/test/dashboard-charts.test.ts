import { describe, expect, it } from 'vitest';
import { barPath, shareLabel } from '@/lib/dashboard/charts';

describe('shareLabel', () => {
  it('keeps a real but tiny part from reading as zero', () => {
    expect(shareLabel(1, 1000)).toBe('<1%');
    expect(shareLabel(0, 1000)).toBe('0%');
    expect(shareLabel(5, 0)).toBe('0%');
    expect(shareLabel(1, 2)).toBe('50%');
  });
});

describe('barPath', () => {
  it('draws a square segment when there is no radius', () => {
    expect(barPath(10, 20, 5, 50)).toBe('M10,50V5H30V50Z');
  });

  it('rounds only the top corners', () => {
    expect(barPath(10, 20, 5, 50, 4)).toBe('M10,50V9Q10,5 14,5H26Q30,5 30,9V50Z');
  });

  it('never rounds past the height of a very short bar', () => {
    expect(barPath(0, 20, 48, 50, 4)).toBe('M0,50V50Q0,48 2,48H18Q20,48 20,50V50Z');
  });
});
