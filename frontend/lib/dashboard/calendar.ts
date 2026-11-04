/** Month-grid maths for the events calendar. No React, so it can be tested. */

export interface CalendarDay {
  /** YYYY-MM-DD in local time. */
  iso: string;
  day: number;
  inMonth: boolean;
}

function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whole weeks, Monday first, covering `month` (0–11). Neighbouring days fill the edges. */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const count = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month, 1 - leading + index);
    return { iso: isoOf(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}
