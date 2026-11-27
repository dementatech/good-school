/* eslint-disable */
exports.shorthands = undefined;

// Subject short forms (BIO, CHEM, MTC) are always written in capitals. Some
// were stored as "Bio"/"Chem"; this capitalises them. A row whose capitalised
// form would clash with another subject in the same scope (same school, or
// same catalog curriculum, and phase) is left alone rather than break the
// short-name unique indexes. New and edited subjects are capitalised on save
// (subjects.repository.ts).

exports.up = (pgm) => {
  pgm.sql(`
    update subject s
       set short_name = upper(s.short_name), updated_at = now()
     where s.short_name <> upper(s.short_name)
       and not exists (
         select 1 from subject t
          where t.id <> s.id
            and t.phase = s.phase
            and upper(t.short_name) = upper(s.short_name)
            and t.school_id is not distinct from s.school_id
            and (s.school_id is not null or t.curriculum_id = s.curriculum_id)
       );
  `);
};

// The original casing isn't kept, so there is nothing to restore.
exports.down = () => {};
