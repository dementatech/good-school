/* eslint-disable */
exports.shorthands = undefined;

// `schools.theme_config` has shipped since the very first migration with a
// stale placeholder default (`primaryColor: "#990000"`, a red nobody chose)
// and nothing has ever read it. School theming turns it on now — a school
// picks a brand colour and it's applied across their portals — so the
// "untouched" value has to equal the real design-system primary (#1e3a8a,
// see frontend/app/globals.css), otherwise every existing school would
// suddenly render red. This normalises the old rows and the column default.

const CANONICAL_DEFAULT = {
  primaryColor: "#1e3a8a",
  accentColor: "#F5CA93",
  radius: "0.625rem",
  fontFamily: "Quicksand, sans-serif",
  logoUrl: null,
};

exports.up = (pgm) => {
  // Only rows still on the shipped placeholder — never clobber a colour a
  // school actually set (none can have yet, but this stays safe if re-run
  // after the feature is live).
  pgm.sql(`
    update schools
    set theme_config = jsonb_set(
      coalesce(theme_config, '{}'::jsonb), '{primaryColor}', '"#1e3a8a"'::jsonb
    )
    where coalesce(theme_config->>'primaryColor', '') in ('', '#990000')
  `);

  pgm.alterColumn("schools", "theme_config", {
    default: pgm.func(`'${JSON.stringify(CANONICAL_DEFAULT)}'::jsonb`),
  });
};

exports.down = (pgm) => {
  const OLD_DEFAULT = {
    primaryColor: "#990000",
    accentColor: "#FFCC99",
    radius: "0.625rem",
    fontFamily: "Poppins, sans-serif",
    logoUrl: null,
  };
  pgm.alterColumn("schools", "theme_config", {
    default: pgm.func(`'${JSON.stringify(OLD_DEFAULT)}'::jsonb`),
  });
};
