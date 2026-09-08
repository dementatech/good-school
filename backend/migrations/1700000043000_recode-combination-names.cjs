/* eslint-disable */
exports.shorthands = undefined;

// PR #8 changed the auto-derived A-Level combination name from
// "concatenate every member's short_name" ("BIOCHEMTC/SCS/GP") to
// "first letter of each core's name, then the subsidiary's short name"
// ("BCM/SCS/GP") — but only for combinations created/edited after it
// shipped. This re-derives the name for rows that already exist.
//
// Member order was never stored, so we recover it from the OLD name itself:
// its first "/"-segment is the principals' short_names concatenated, and
// there's exactly one ordering of this combination's principals whose
// short_names concatenate to that string. Everything after the first "/"
// (the subsidiary short name + "/GP") is unchanged by the new rule, so it's
// carried over verbatim.
//
// Guard: only names that look auto-generated are touched — no whitespace,
// ending in "/GP". A school that typed a real label keeps it.

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

/** The order of `shorts` whose concatenation === blob, or null. */
function recoverOrder(blob, shorts) {
  for (const perm of permutations(shorts)) {
    if (perm.join("") === blob) return perm;
  }
  return null;
}

async function recode(pgm, comboTable, linkTable, linkFk) {
  const rows = await pgm.db.select(`
    select c.id, c.name,
           json_agg(json_build_object(
             'name', s.name, 'short', s.short_name, 'role', l.role
           )) as members
    from ${comboTable} c
    join ${linkTable} l on l.${linkFk} = c.id
    join subject s on s.id = l.subject_id
    group by c.id, c.name
  `);

  for (const row of rows) {
    const name = row.name;
    if (/\s/.test(name) || !name.endsWith("/GP")) continue;

    const principals = row.members.filter((m) => m.role === "principal");
    if (principals.length === 0) continue;

    const [blob, ...rest] = name.split("/");
    const tail = rest.join("/"); // "SCS/GP" or just "GP"

    const ordered = recoverOrder(
      blob,
      principals.map((p) => p.short),
    );
    if (!ordered) continue; // can't parse the old blob — leave it alone

    const firstLetter = new Map(
      principals.map((p) => [p.short, (p.name.trim()[0] || "").toUpperCase()]),
    );
    const core = ordered.map((short) => firstLetter.get(short)).join("");
    const newName = `${core}/${tail}`;

    if (newName !== name) {
      await pgm.db.query(
        `update ${comboTable} set name = $1, updated_at = now() where id = $2`,
        [newName, row.id],
      );
    }
  }
}

exports.up = async (pgm) => {
  await recode(pgm, "subject_combination", "combination_subject", "combination_id");
  await recode(pgm, "school_combination", "school_combination_subject", "school_combination_id");
};

// One-way: the pre-PR-#8 names can't be reconstructed. Re-saving a
// combination re-derives its name anyway.
exports.down = () => {};
