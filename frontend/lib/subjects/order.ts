/**
 * Core subjects first, optionals last, alphabetical within each.
 *
 * The backend marks classSubjects with `isCore` (catalog 'core', compulsory
 * for the school that year, or an A-Level principal). Where a response
 * doesn't carry it, an O-Level subject counts as core by name: the UCE core
 * of English, Mathematics, Physics, Chemistry, Biology, Geography and History.
 */
const CORE_NAME = /^(english|math|mathematics|mtc|physics|phy|chemistry|chem|biology|bio|geography|geog|geo|history|hist)\b/i;

export function looksCore(name: string): boolean {
  return CORE_NAME.test(name);
}

export function byCoreThenName<T extends { subjectName: string; isCore?: boolean }>(a: T, b: T): number {
  const coreA = a.isCore ?? looksCore(a.subjectName);
  const coreB = b.isCore ?? looksCore(b.subjectName);
  return Number(coreB) - Number(coreA) || a.subjectName.localeCompare(b.subjectName);
}
