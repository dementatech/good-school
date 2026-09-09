/* eslint-disable */
exports.shorthands = undefined;

// Combination names are now DERIVED from the current member subjects on every
// read, not stored. So if a subject's name/short_name changes, every
// combination it belongs to — new or old — updates with it.
//
// - `combination_subject` / `school_combination_subject` gain `sort_order`,
//   the pick order the name is built from (cores by first letter of name,
//   subsidiary by short_name — see combination-name / the SELECT expressions).
//   Backfilled by recovering the order from the currently-stored name.
// - `subject_combination.name` / `school_combination.name` are dropped —
//   nothing writes or reads a stored name any more. There is no per-
//   combination manual override; the name is a pure function of the subjects.

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

// The stored name's principal segment is the first letters of the core
// subject names concatenated (post-PR-#9). Find the core ordering that
// reproduces it; fall back to name order when it can't be matched (a
// hand-typed label, a subject renamed since, ...).
function recoverPrincipalOrder(storedName, principals) {
  const seg = String(storedName || "").split("/")[0];
  const letter = (p) => (p.name.trim()[0] || "").toUpperCase();
  for (const perm of permutations(principals)) {
    if (perm.map(letter).join("") === seg) return perm;
  }
  return [...principals].sort((a, b) => a.name.localeCompare(b.name));
}

async function backfillOrder(pgm, comboTable, linkTable, linkFk) {
  const rows = await pgm.db.select(`
    select c.id, c.name,
           json_agg(json_build_object(
             'sid', s.id, 'name', s.name, 'role', l.role
           )) as members
    from ${comboTable} c
    join ${linkTable} l on l.${linkFk} = c.id
    join subject s on s.id = l.subject_id
    group by c.id, c.name
  `);

  for (const row of rows) {
    const members = row.members;
    const principals = members.filter((m) => m.role === "principal");
    const others = members.filter((m) => m.role !== "principal");
    const orderedPrincipals = recoverPrincipalOrder(row.name, principals);
    const ordered = [
      ...orderedPrincipals,
      ...others.sort((a, b) => a.name.localeCompare(b.name)),
    ];
    for (let i = 0; i < ordered.length; i++) {
      await pgm.db.query(
        `update ${linkTable} set sort_order = $1 where ${linkFk} = $2 and subject_id = $3`,
        [i, row.id, ordered[i].sid],
      );
    }
  }
}

exports.up = async (pgm) => {
  // Every step here runs immediately: `backfillOrder` uses `pgm.db.query`
  // (an escape hatch that executes now), not the queued `pgm.*` builder.
  // So the ADD COLUMN and DROP COLUMN must go through `pgm.db.query` too —
  // a `pgm.addColumn` is only flushed *after* this function returns, which
  // left the backfill UPDATE hitting a `sort_order` column that did not
  // exist yet (prod deploy failure, 2026-09-09).
  await pgm.db.query(
    `alter table combination_subject add column sort_order integer not null default 0`,
  );
  await pgm.db.query(
    `alter table school_combination_subject add column sort_order integer not null default 0`,
  );

  await backfillOrder(pgm, "subject_combination", "combination_subject", "combination_id");
  await backfillOrder(
    pgm,
    "school_combination",
    "school_combination_subject",
    "school_combination_id",
  );

  await pgm.db.query(`alter table subject_combination drop column name`);
  await pgm.db.query(`alter table school_combination drop column name`);
};

exports.down = (pgm) => {
  // The pre-drop names can't be reconstructed here; re-add the columns empty.
  // App code derives the display name from members regardless.
  pgm.addColumn("subject_combination", { name: { type: "text" } });
  pgm.addColumn("school_combination", { name: { type: "text" } });
  pgm.dropColumn("combination_subject", "sort_order");
  pgm.dropColumn("school_combination_subject", "sort_order");
};
