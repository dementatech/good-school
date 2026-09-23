'use client';

import { useEffect, useState } from 'react';

/**
 * The education levels a school can run, in ladder order — each is a
 * `curriculum_stage.phase` value. Mirrors backend/src/shared/levels.ts.
 */
export type SchoolLevel = 'KINDERGARTEN' | 'PRIMARY' | 'O_LEVEL' | 'A_LEVEL';

/** Levels with a subject catalog — Kindergarten uses learning areas instead. */
export type SubjectPhase = Exclude<SchoolLevel, 'KINDERGARTEN'>;

export const SCHOOL_LEVELS: SchoolLevel[] = ['KINDERGARTEN', 'PRIMARY', 'O_LEVEL', 'A_LEVEL'];
export const SUBJECT_PHASES: SubjectPhase[] = ['PRIMARY', 'O_LEVEL', 'A_LEVEL'];

export const LEVEL_LABEL: Record<SchoolLevel, string> = {
  KINDERGARTEN: 'Kindergarten',
  PRIMARY: 'Primary',
  O_LEVEL: 'O-Level',
  A_LEVEL: 'A-Level',
};

export const LEVEL_STAGE_RANGE: Record<SchoolLevel, string> = {
  KINDERGARTEN: 'Baby – Top Class',
  PRIMARY: 'Primary 1–7',
  O_LEVEL: 'Senior 1–4',
  A_LEVEL: 'Senior 5–6',
};

export const PRIMARY_CYCLE_LABEL: Record<string, string> = {
  LOWER: 'Lower Primary',
  TRANSITION: 'Transition',
  UPPER: 'Upper Primary',
};

export interface SchoolLevelFlags {
  offersKindergarten: boolean;
  offersPrimary: boolean;
  offersOLevel: boolean;
  offersALevel: boolean;
}

export function levelsOffered(flags: SchoolLevelFlags): SchoolLevel[] {
  return SCHOOL_LEVELS.filter((l) => offersLevel(flags, l));
}

export function offersLevel(flags: SchoolLevelFlags, level: SchoolLevel): boolean {
  switch (level) {
    case 'KINDERGARTEN':
      return flags.offersKindergarten;
    case 'PRIMARY':
      return flags.offersPrimary;
    case 'O_LEVEL':
      return flags.offersOLevel;
    case 'A_LEVEL':
      return flags.offersALevel;
  }
}

// One fetch per page load, shared by every caller — the nav, subject pages
// and pickers all ask the same question.
let cached: Promise<SchoolLevelFlags | null> | null = null;

function fetchLevels(): Promise<SchoolLevelFlags | null> {
  if (!cached) {
    cached = fetch('/api/v1/schools/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const s = body?.data ?? body;
        // /schools/me only sends the levels a school runs — an absent flag
        // means "not offered". A response with no level at all isn't a school.
        if (!s || !(s.offersKindergarten || s.offersPrimary || s.offersOLevel || s.offersALevel)) return null;
        return {
          offersKindergarten: !!s.offersKindergarten,
          offersPrimary: !!s.offersPrimary,
          offersOLevel: !!s.offersOLevel,
          offersALevel: !!s.offersALevel,
        };
      })
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return cached;
}

// ── Sections ────────────────────────────────────────────────────────────────
// A school runs sections — Nursery, Primary, Secondary (O/A-Level) — each
// effectively its own institution. A school with Nursery AND Primary is one
// login with two sections: the school admin switches between them and every
// screen works on one at a time. Mirrors backend/src/shared/levels.ts.

export type SchoolSection = 'KINDERGARTEN' | 'PRIMARY' | 'SECONDARY';

const SECTIONS: SchoolSection[] = ['KINDERGARTEN', 'PRIMARY', 'SECONDARY'];

export const SECTION_LEVELS: Record<SchoolSection, SchoolLevel[]> = {
  KINDERGARTEN: ['KINDERGARTEN'],
  PRIMARY: ['PRIMARY'],
  SECONDARY: ['O_LEVEL', 'A_LEVEL'],
};

export const SECTION_LABEL: Record<SchoolSection, string> = {
  KINDERGARTEN: 'Nursery',
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
};

/** Sent with every request, so the backend scopes to the same section. */
const SECTION_COOKIE = 'gs_section';

export function sectionsOf(flags: SchoolLevelFlags): SchoolSection[] {
  return SECTIONS.filter((s) => SECTION_LEVELS[s].some((l) => offersLevel(flags, l)));
}

function readSectionCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SECTION_COOKIE}=`))
    ?.slice(SECTION_COOKIE.length + 1);
}

/** The chosen section if the school has it, else its first — the backend
 * applies the identical fallback. */
export function activeSectionOf(flags: SchoolLevelFlags): SchoolSection | null {
  const sections = sectionsOf(flags);
  const chosen = readSectionCookie();
  return sections.find((s) => s === chosen) ?? sections[0] ?? null;
}

/** Switch section, then reload so every screen refetches for it. */
export function switchSection(section: SchoolSection): void {
  document.cookie = `${SECTION_COOKIE}=${section}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

function scopeToSection(flags: SchoolLevelFlags, section: SchoolSection | null): SchoolLevelFlags {
  const keep = (l: SchoolLevel) => !!section && SECTION_LEVELS[section].includes(l) && offersLevel(flags, l);
  return {
    offersKindergarten: keep('KINDERGARTEN'),
    offersPrimary: keep('PRIMARY'),
    offersOLevel: keep('O_LEVEL'),
    offersALevel: keep('A_LEVEL'),
  };
}

/**
 * The levels a screen should work with, or null while loading / outside a
 * school context. Treat null as "show no level-specific UI yet" — a school
 * must never glimpse a level it doesn't run, not even while loading.
 *
 * By default only the ACTIVE section's levels (the school-admin portal works
 * one section at a time); `{ scoped: false }` gives every level the school
 * runs — for the teacher portal, which follows the teacher's own classes.
 */
export function useSchoolLevels(opts: { scoped?: boolean } = {}): SchoolLevelFlags | null {
  return useSchoolLevelsState(opts).flags;
}

/** Same, plus whether the lookup has finished — to tell "still loading"
 * apart from "no levels / no school". */
export function useSchoolLevelsState(opts: { scoped?: boolean } = {}): {
  loaded: boolean;
  flags: SchoolLevelFlags | null;
} {
  const scoped = opts.scoped ?? true;
  const { loaded, flags } = useAllSchoolLevels();
  if (!flags || !scoped) return { loaded, flags };
  return { loaded, flags: scopeToSection(flags, activeSectionOf(flags)) };
}

/** The school's sections and which one is active — for the switcher. */
export function useSchoolSections(): { sections: SchoolSection[]; active: SchoolSection | null } {
  const { flags } = useAllSchoolLevels();
  if (!flags) return { sections: [], active: null };
  return { sections: sectionsOf(flags), active: activeSectionOf(flags) };
}

function useAllSchoolLevels(): { loaded: boolean; flags: SchoolLevelFlags | null } {
  const [state, setState] = useState<{ loaded: boolean; flags: SchoolLevelFlags | null }>({
    loaded: false,
    flags: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetchLevels().then((flags) => {
      if (!cancelled) setState({ loaded: true, flags });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Forget the cached flags — call after the school's levels are edited. */
export function invalidateSchoolLevels(): void {
  cached = null;
}
