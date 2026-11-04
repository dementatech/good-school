/** Placeholder events for seeing the calendar full while developing. */

type SampleType = 'holiday' | 'exam' | 'meeting' | 'deadline' | 'other';
type SampleAudience = 'all' | 'staff' | 'students' | 'parents';

// The first four are what the Coming Up panel shows.
const SAMPLES: { title: string; daysAhead: number; eventType: SampleType; audience: SampleAudience; description: string }[] = [
  { title: 'Staff meeting', daysAhead: 2, eventType: 'meeting', audience: 'staff', description: 'Staffroom, 4:00 pm.' },
  { title: 'Mid-term exams begin', daysAhead: 6, eventType: 'exam', audience: 'all', description: 'Timetables are on the noticeboard.' },
  { title: 'Parents visiting day', daysAhead: 13, eventType: 'other', audience: 'parents', description: 'Meet class teachers from 9:00 am.' },
  { title: 'Inter-house sports day', daysAhead: 21, eventType: 'other', audience: 'all', description: 'School field, all day.' },
  { title: 'Mid-term marks due', daysAhead: 6, eventType: 'deadline', audience: 'staff', description: 'Submit mark sheets by 5:00 pm.' },
  { title: 'Public holiday', daysAhead: 27, eventType: 'holiday', audience: 'all', description: 'No lessons.' },
];

export interface SampleableEvent {
  id: string;
  title: string;
  eventDate: string;
  description?: string | null;
  eventType?: SampleType;
  audience?: SampleAudience;
  isSample?: boolean;
  schoolId?: string | null;
  schoolExamId?: string | null;
  thumbnailUrl?: string | null;
  shareToken?: string | null;
}

function buildSamples(today: Date, toIsoDate: (date: Date) => string): SampleableEvent[] {
  return SAMPLES.map((sample, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + sample.daysAhead);
    return {
      id: `sample-${index}`,
      title: sample.title,
      description: sample.description,
      eventType: sample.eventType,
      audience: sample.audience,
      eventDate: toIsoDate(date),
      isSample: true,
    };
  });
}

/** Real events plus samples up to `limit`, soonest first. */
export function withSampleEvents<T extends SampleableEvent>(
  real: T[],
  limit: number,
  today: Date,
  toIsoDate: (date: Date) => string,
): SampleableEvent[] {
  const samples = buildSamples(today, toIsoDate).slice(0, Math.min(Math.max(limit - real.length, 0), 4));
  return [...real, ...samples].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

/** Real events plus every sample falling inside a date range, soonest first. */
export function withSamplesInRange<T extends SampleableEvent>(
  real: T[],
  from: string,
  to: string,
  today: Date,
  toIsoDate: (date: Date) => string,
): SampleableEvent[] {
  const samples = buildSamples(today, toIsoDate).filter((sample) => sample.eventDate >= from && sample.eventDate <= to);
  return [...real, ...samples].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}
