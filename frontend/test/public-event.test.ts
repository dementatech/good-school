import { describe, expect, it } from 'vitest';
import { countdownLabel, eventDateParts, formatEventDate, googleCalendarUrl, publicEventPath, shareMessage, todayInKampala } from '@/lib/events/public-event';

describe('public event helpers', () => {
  it('never moves a calendar date across time zones', () => {
    expect(formatEventDate('2027-06-03')).toBe('Thursday, 3 June 2027');
    expect(eventDateParts('2027-06-03')).toEqual({ day: '3', month: 'Jun' });
  });

  it('counts down in plain words', () => {
    expect(countdownLabel('2026-11-04', '2026-11-04')).toBe('Today');
    expect(countdownLabel('2026-11-05', '2026-11-04')).toBe('Tomorrow');
    expect(countdownLabel('2026-11-16', '2026-11-04')).toBe('In 12 days');
    expect(countdownLabel('2026-11-03', '2026-11-04')).toBe('This event has passed');
  });

  it('uses Kampala time for today, three hours ahead of UTC', () => {
    expect(todayInKampala(new Date('2026-11-04T22:30:00Z'))).toBe('2026-11-05');
  });

  it('leaves out an empty description', () => {
    expect(shareMessage({ title: 'Sports day', eventDate: '2026-11-25', description: '  ' })).toBe('Sports day\nWednesday, 25 November 2026');
  });

  it('makes an all-day Google Calendar link ending the next day', () => {
    const url = new URL(googleCalendarUrl({ title: 'Sports day', eventDate: '2026-12-31' }, 'https://x.test/e/a'));
    expect(url.searchParams.get('dates')).toBe('20261231/20270101');
    expect(url.searchParams.get('details')).toBe('https://x.test/e/a');
  });

  it('escapes the token in the path', () => {
    expect(publicEventPath('a/b')).toBe('/e/a%2Fb');
  });
});
