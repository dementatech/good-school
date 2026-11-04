/* eslint-disable */
exports.shorthands = undefined;

// The national calendar every Ugandan school shares, as global events
// (school_id null), researched November 2026. A migration, not a seed, so it
// runs once: an event a super admin later edits or deletes on the Global Events
// page stays that way. Sources:
//   Term dates: Ministry of Education and Sports 2026 calendar, as reported by
//     Pulse Uganda (6 Jan 2026) and reconfirmed by the ministry in Sept 2026.
//   UNEB: Ministry of Education and UNEB announcements, The Independent (Sept 2026).
//   Holidays: officeholidays.com/countries/uganda/2027.
// Not included: 2027 term dates, because the ministry hadn't published them yet.

const NATIONAL_EXAM_NOTE = "UNEB national exam. Check your centre's timetable for each paper.";
const MOON_NOTE = "Expected date. The Muslim authorities confirm it by moon sighting, so it may move by a day.";

const EVENTS = [
  ["UACE exams begin", "2026-11-07", "exam", NATIONAL_EXAM_NOTE],
  ["Third term ends", "2026-12-04", "other", "Holidays run from 5 December 2026 to 31 January 2027."],
  ["UACE exams end", "2026-12-05", "exam", NATIONAL_EXAM_NOTE],
  ["Christmas Day", "2026-12-25", "holiday", "Public holiday."],
  ["Boxing Day", "2026-12-26", "holiday", "Public holiday."],
  ["New Year's Day", "2027-01-01", "holiday", "Public holiday."],
  ["NRM Liberation Day", "2027-01-26", "holiday", "Public holiday."],
  ["Third term holidays end", "2027-01-31", "other", "Last day of the holidays. Check the ministry's 2027 calendar for opening dates."],
  ["Archbishop Janani Luwum Day", "2027-02-16", "holiday", "Public holiday."],
  ["International Women's Day", "2027-03-08", "holiday", "Public holiday."],
  ["Eid al-Fitr (expected)", "2027-03-09", "holiday", `Public holiday. ${MOON_NOTE}`],
  ["Good Friday", "2027-03-26", "holiday", "Public holiday."],
  ["Easter Monday", "2027-03-29", "holiday", "Public holiday."],
  ["Labour Day", "2027-05-01", "holiday", "Public holiday."],
  ["Eid al-Adha (expected)", "2027-05-16", "holiday", `Public holiday. ${MOON_NOTE}`],
  ["Martyrs' Day", "2027-06-03", "holiday", "Public holiday."],
  ["National Heroes' Day", "2027-06-09", "holiday", "Public holiday."],
  ["Independence Day", "2027-10-09", "holiday", "Public holiday."],
];

const literal = (text) => `'${text.replace(/'/g, "''")}'`;

exports.EVENTS = EVENTS;

exports.up = (pgm) => {
  for (const [title, date, type, description] of EVENTS) {
    // Skips anything a super admin has already added by hand.
    pgm.sql(`
      insert into school_event (school_id, title, description, event_date, event_type, audience)
      select null::uuid, ${literal(title)}, ${literal(description)}, date ${literal(date)}, ${literal(type)}, 'all'
      where not exists (
        select 1 from school_event
        where school_id is null and title = ${literal(title)} and event_date = date ${literal(date)}
      )
    `);
  }
};

exports.down = (pgm) => {
  for (const [title, date] of EVENTS) {
    pgm.sql(`
      delete from school_event
      where school_id is null and created_by is null
        and title = ${literal(title)} and event_date = date ${literal(date)}
    `);
  }
};
