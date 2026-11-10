import { describe, expect, it } from 'vitest';
import { toWaveform } from './useVoiceRecorder';
import { clock } from './format';

describe('toWaveform', () => {
  it('squeezes any number of samples into the requested bars, loudest = 100', () => {
    const bars = toWaveform([0, 0.5, 1, 0.5, 0.25, 0.25], 3);
    expect(bars).toHaveLength(3);
    expect(Math.max(...bars)).toBe(100);
  });

  it('keeps a minimum height so silence still shows a line', () => {
    expect(toWaveform([0, 0, 0, 1], 4)[0]).toBe(4);
    expect(toWaveform([], 5)).toEqual([4, 4, 4, 4, 4]);
  });

  it('stretches short recordings across every bar', () => {
    expect(toWaveform([1], 48)).toHaveLength(48);
  });
});

describe('clock', () => {
  it('formats minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(7_340)).toBe('0:07');
    expect(clock(102_000)).toBe('1:42');
    expect(clock(725_000)).toBe('12:05');
  });
});
