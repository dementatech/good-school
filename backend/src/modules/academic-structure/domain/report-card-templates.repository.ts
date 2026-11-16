import { pool } from "../../../shared/db/index.js";
import { levelsForSchool, sectionsOf, type SchoolSection } from "../../../shared/levels.js";
import { REPORT_CARD_FIELDS, reportCardFieldsOf, showPositionsFor, type ReportCardFields } from "./section-settings.repository.js";

// Report card templates — see migration 1700000083000_report-card-templates.cjs.
//
// Two kinds:
//   - "styled": the card flows top to bottom (header, learner, results,
//     summary, remarks, signatures). The school picks which parts show, the
//     results table's column order, colours, frame, font, spacing and wording.
//   - "canvas": the page editor. Blocks (school name, logo, results table,
//     free text, lines, ...) are placed anywhere on an A4 page, in mm.
//
// Built-ins live here, never in the database, so improving one reaches every
// school that uses it. A school edits a copy. Everything a client sends goes
// through normalizeDesign(): unknown keys are dropped and every value is
// checked, so a stored design is always one the renderer understands.

export type TemplateKind = "styled" | "canvas";

export const COLUMN_KEYS = [
  "rowNumbers",
  "subjectCode",
  "subject",
  "scores",
  "grade",
  "points",
  "subjectRemarks",
  "teacherInitials",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

const FRAMES = ["double", "single", "none"] as const;
const FONTS = ["rounded", "plain", "serif"] as const;
const DENSITIES = ["comfortable", "compact"] as const;
const HEADERS = ["centered", "left"] as const;
const TABLES = ["bordered", "striped", "minimal"] as const;

export interface TemplateStyle {
  /** Frame, headings and table header. */
  accent: string;
  /** The title badge. */
  highlight: string;
  frame: (typeof FRAMES)[number];
  font: (typeof FONTS)[number];
  density: (typeof DENSITIES)[number];
  header: (typeof HEADERS)[number];
  table: (typeof TABLES)[number];
}
export interface TemplateText {
  title: string;
  signatures: string[];
  footerNote: string;
}

export const BLOCK_TYPES = [
  "header",
  "schoolName",
  "schoolDetails",
  "examTitle",
  "badge",
  "logo",
  "photo",
  "learner",
  "results",
  "summary",
  "remarks",
  "signatures",
  "issuedDate",
  "gradingKey",
  "footerNote",
  "text",
  "line",
  "box",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export type BlockProps = Record<string, string | number | boolean>;
export interface CanvasBlock {
  id: string;
  type: BlockType;
  /** Position and size on the A4 page, in millimetres. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: BlockProps;
}

export interface TemplateDesign {
  /** The built-in this was made from; fills anything missing. */
  base: string;
  fields: Partial<ReportCardFields>;
  columns: ColumnKey[];
  style: TemplateStyle;
  text: TemplateText;
  /** Canvas templates only. */
  blocks?: CanvasBlock[];
}

export interface ReportCardTemplate {
  /** "builtin:<key>" or the stored template's uuid. */
  id: string;
  name: string;
  description: string | null;
  section: SchoolSection;
  kind: TemplateKind;
  builtIn: boolean;
  design: TemplateDesign;
  updatedAt: string | null;
}

/** What a report card is printed with: the template plus its full field set. */
export interface ResolvedTemplate extends ReportCardTemplate {
  fields: ReportCardFields;
}

export class InvalidTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTemplateError";
  }
}

export const PAGE_MM = { width: 210, height: 297 } as const;

// ─── Built-ins ──────────────────────────────────────────────────────────────

const ALL_COLUMNS: ColumnKey[] = [...COLUMN_KEYS];
const DEFAULT_SIGNATURES = ["Class Teacher's Signature", "Parent/Guardian's Signature", "Head Teacher's Signature"];
const CLASSIC_STYLE: TemplateStyle = {
  accent: "#2E77AE",
  highlight: "#FF8E2B",
  frame: "double",
  font: "rounded",
  density: "comfortable",
  header: "centered",
  table: "bordered",
};
const CLASSIC_TEXT: TemplateText = { title: "Report Card", signatures: DEFAULT_SIGNATURES, footerNote: "" };

const block = (id: string, type: BlockType, x: number, y: number, w: number, h: number, props: BlockProps = {}): CanvasBlock => ({
  id,
  type,
  x,
  y,
  w,
  h,
  props,
});

// A sensible starting page for the editor: everything a card normally has,
// where a school would expect it, ready to be moved around.
const STARTER_BLOCKS: CanvasBlock[] = [
  block("logo", "logo", 12, 12, 24, 24),
  block("school", "schoolName", 40, 12, 130, 10, { align: "center", size: 18 }),
  block("details", "schoolDetails", 40, 23, 130, 8, { align: "center" }),
  block("exam", "examTitle", 40, 31, 130, 6, { align: "center" }),
  block("badge", "badge", 85, 38, 40, 6),
  block("photo", "photo", 176, 12, 22, 28),
  block("rule", "line", 12, 47, 186, 1, { thickness: 2, color: "accent" }),
  block("learner", "learner", 12, 50, 186, 16),
  block("results", "results", 12, 69, 186, 120),
  block("summary", "summary", 12, 192, 186, 14),
  block("remarks", "remarks", 12, 209, 186, 18),
  block("signatures", "signatures", 12, 233, 186, 14),
  block("issued", "issuedDate", 12, 250, 90, 5),
  block("key", "gradingKey", 12, 257, 186, 20),
];

interface BuiltIn {
  key: string;
  name: string;
  description: string;
  kind: TemplateKind;
  design: Omit<TemplateDesign, "base">;
}

const BUILT_INS: BuiltIn[] = [
  {
    key: "classic",
    name: "Classic",
    description: "Certificate-style double frame, centred header. The original look.",
    kind: "styled",
    design: { fields: {}, columns: ALL_COLUMNS, style: CLASSIC_STYLE, text: CLASSIC_TEXT },
  },
  {
    key: "modern",
    name: "Modern",
    description: "Clean single frame, header on the left, striped results.",
    kind: "styled",
    design: {
      fields: {},
      columns: ALL_COLUMNS,
      style: { ...CLASSIC_STYLE, accent: "#0F766E", highlight: "#0F766E", frame: "single", font: "plain", header: "left", table: "striped" },
      text: CLASSIC_TEXT,
    },
  },
  {
    key: "compact",
    name: "Compact",
    description: "Tight spacing, short subject names and no photo: the most room for marks.",
    kind: "styled",
    design: {
      fields: { studentPhoto: false, shortSubjectNames: true, subjectCode: true, paperBreakdown: false },
      columns: ALL_COLUMNS,
      style: { ...CLASSIC_STYLE, accent: "#1E3A5F", highlight: "#1E3A5F", frame: "single", font: "plain", density: "compact", table: "minimal" },
      text: { ...CLASSIC_TEXT, title: "Progress Report" },
    },
  },
  {
    key: "formal",
    name: "Formal",
    description: "Serif type, maroon and gold, for end-of-term and end-of-year cards.",
    kind: "styled",
    design: {
      fields: {},
      columns: ALL_COLUMNS,
      style: { ...CLASSIC_STYLE, accent: "#7A1F2B", highlight: "#B8892B", font: "serif" },
      text: { ...CLASSIC_TEXT, title: "Academic Report" },
    },
  },
  {
    key: "canvas",
    name: "Page layout",
    description: "Start from a full page and drag every part where you want it.",
    kind: "canvas",
    design: { fields: {}, columns: ALL_COLUMNS, style: CLASSIC_STYLE, text: CLASSIC_TEXT, blocks: STARTER_BLOCKS },
  },
];

const BUILTIN_PREFIX = "builtin:";
const DEFAULT_BUILTIN = "classic";

function builtInTemplate(b: BuiltIn, section: SchoolSection): ReportCardTemplate {
  return {
    id: `${BUILTIN_PREFIX}${b.key}`,
    name: b.name,
    description: b.description,
    section,
    kind: b.kind,
    builtIn: true,
    design: normalizeDesign(section, b.kind, { ...b.design, base: b.key }),
    updatedAt: null,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : fallback;
const str = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? v.slice(0, max) : fallback);
const color = (v: unknown, fallback: string): string => (v === "accent" || (typeof v === "string" && HEX.test(v)) ? (v as string) : fallback);

// Each block type's props: their kind and limits. Anything else is dropped.
type PropRule =
  | { kind: "enum"; options: readonly string[]; fallback: string }
  | { kind: "number"; min: number; max: number; fallback: number }
  | { kind: "bool"; fallback: boolean }
  | { kind: "color"; fallback: string }
  | { kind: "text"; max: number; fallback: string };
const ALIGN: PropRule = { kind: "enum", options: ["left", "center", "right"], fallback: "left" };
const SIZE = (fallback: number): PropRule => ({ kind: "number", min: 6, max: 48, fallback });
const BLOCK_PROPS: Record<BlockType, Record<string, PropRule>> = {
  header: {},
  schoolName: { align: ALIGN, size: SIZE(18) },
  schoolDetails: { align: ALIGN },
  examTitle: { align: ALIGN },
  badge: {},
  logo: {},
  photo: {},
  learner: {},
  results: {},
  summary: {},
  remarks: {},
  signatures: {},
  issuedDate: { align: ALIGN },
  gradingKey: {},
  footerNote: { align: ALIGN },
  text: {
    text: { kind: "text", max: 600, fallback: "Text" },
    size: SIZE(11),
    bold: { kind: "bool", fallback: false },
    italic: { kind: "bool", fallback: false },
    uppercase: { kind: "bool", fallback: false },
    align: ALIGN,
    color: { kind: "color", fallback: "#1F2937" },
  },
  line: {
    thickness: { kind: "number", min: 0.5, max: 6, fallback: 1 },
    color: { kind: "color", fallback: "accent" },
  },
  box: {
    thickness: { kind: "number", min: 0, max: 6, fallback: 1 },
    color: { kind: "color", fallback: "accent" },
    fill: { kind: "text", max: 7, fallback: "" },
    radius: { kind: "number", min: 0, max: 20, fallback: 0 },
  },
};

function normalizeProps(type: BlockType, raw: unknown): BlockProps {
  const input = isRecord(raw) ? raw : {};
  const out: BlockProps = {};
  for (const [key, rule] of Object.entries(BLOCK_PROPS[type])) {
    const v = input[key];
    if (rule.kind === "enum") out[key] = pick(rule.options, v, rule.fallback);
    else if (rule.kind === "number") out[key] = clamp(v, rule.min, rule.max, rule.fallback);
    else if (rule.kind === "bool") out[key] = typeof v === "boolean" ? v : rule.fallback;
    else if (rule.kind === "color") out[key] = color(v, rule.fallback);
    else out[key] = str(v, rule.max, rule.fallback);
  }
  if (type === "box" && out.fill && !HEX.test(String(out.fill))) out.fill = "";
  return out;
}

function normalizeBlocks(raw: unknown, fallback: CanvasBlock[]): CanvasBlock[] {
  if (!Array.isArray(raw)) return fallback;
  if (raw.length > 80) throw new InvalidTemplateError("A page can hold at most 80 blocks.");
  const seen = new Set<string>();
  const out: CanvasBlock[] = [];
  for (const b of raw) {
    if (!isRecord(b) || !BLOCK_TYPES.includes(b.type as BlockType)) continue;
    const type = b.type as BlockType;
    let id = str(b.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `${type}-${out.length}`;
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    const x = clamp(b.x, 0, PAGE_MM.width - 2, 10);
    const y = clamp(b.y, 0, PAGE_MM.height - 1, 10);
    out.push({
      id,
      type,
      x,
      y,
      w: clamp(b.w, 2, PAGE_MM.width - x, 40),
      h: clamp(b.h, 0.5, PAGE_MM.height - y, 10),
      props: normalizeProps(type, b.props),
    });
  }
  return out;
}

/** A design the renderer can trust: the base built-in, overlaid with what's valid in `raw`. */
export function normalizeDesign(section: SchoolSection, kind: TemplateKind, raw: unknown): TemplateDesign {
  const input = isRecord(raw) ? raw : {};
  const baseKey = typeof input.base === "string" && BUILT_INS.some((b) => b.key === input.base) ? input.base : null;
  const base =
    BUILT_INS.find((b) => b.key === baseKey && b.kind === kind) ??
    BUILT_INS.find((b) => b.kind === kind) ??
    BUILT_INS[0];

  const fields: Partial<ReportCardFields> = { ...base.design.fields };
  if (isRecord(input.fields)) {
    for (const [key, value] of Object.entries(input.fields)) {
      const field = REPORT_CARD_FIELDS[key as keyof typeof REPORT_CARD_FIELDS];
      if (!field || typeof value !== "boolean") continue;
      if (!(field.sections as readonly SchoolSection[]).includes(section)) continue;
      fields[key as keyof ReportCardFields] = value;
    }
  }

  let columns = base.design.columns;
  if (Array.isArray(input.columns)) {
    const chosen = input.columns.filter((c, i, all): c is ColumnKey => COLUMN_KEYS.includes(c as ColumnKey) && all.indexOf(c) === i);
    // Every column keeps a place, so switching one on later puts it somewhere.
    columns = [...chosen, ...COLUMN_KEYS.filter((c) => !chosen.includes(c))];
  }

  const s = isRecord(input.style) ? input.style : {};
  const b = base.design.style;
  const style: TemplateStyle = {
    accent: typeof s.accent === "string" && HEX.test(s.accent) ? s.accent : b.accent,
    highlight: typeof s.highlight === "string" && HEX.test(s.highlight) ? s.highlight : b.highlight,
    frame: pick(FRAMES, s.frame, b.frame),
    font: pick(FONTS, s.font, b.font),
    density: pick(DENSITIES, s.density, b.density),
    header: pick(HEADERS, s.header, b.header),
    table: pick(TABLES, s.table, b.table),
  };

  const t = isRecord(input.text) ? input.text : {};
  const bt = base.design.text;
  const signatures = Array.isArray(t.signatures)
    ? t.signatures.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 4)
    : bt.signatures;
  const text: TemplateText = {
    title: str(t.title, 40, bt.title),
    signatures,
    footerNote: str(t.footerNote, 300, bt.footerNote),
  };

  const design: TemplateDesign = { base: base.key, fields, columns, style, text };
  if (kind === "canvas") design.blocks = normalizeBlocks(input.blocks, base.design.blocks ?? STARTER_BLOCKS);
  return design;
}

// ─── Storage ────────────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  section: SchoolSection;
  name: string;
  kind: TemplateKind;
  design: unknown;
  updated_at: string;
}

function fromRow(r: TemplateRow): ReportCardTemplate {
  return {
    id: r.id,
    name: r.name,
    description: null,
    section: r.section,
    kind: r.kind,
    builtIn: false,
    design: normalizeDesign(r.section, r.kind, r.design),
    updatedAt: r.updated_at,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownTemplate(schoolId: string, id: string): Promise<ReportCardTemplate | null> {
  if (!UUID.test(id)) return null;
  const { rows } = await pool.query<TemplateRow>(
    `select id, section, name, kind, design, updated_at from report_card_template where school_id = $1 and id = $2`,
    [schoolId, id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** A template the school may print a section with: a built-in or its own for that section. */
export async function findTemplate(schoolId: string, section: SchoolSection, ref: string): Promise<ReportCardTemplate | null> {
  if (ref.startsWith(BUILTIN_PREFIX)) {
    const b = BUILT_INS.find((x) => `${BUILTIN_PREFIX}${x.key}` === ref);
    return b ? builtInTemplate(b, section) : null;
  }
  const own = await ownTemplate(schoolId, ref);
  return own && own.section === section ? own : null;
}

async function defaultRefs(schoolId: string): Promise<Map<SchoolSection, string>> {
  const { rows } = await pool.query<{ section: SchoolSection; report_card_template: string | null }>(
    `select section, report_card_template from school_section where school_id = $1`,
    [schoolId],
  );
  return new Map(rows.filter((r) => r.report_card_template).map((r) => [r.section, r.report_card_template!]));
}

export interface TemplateListing {
  section: SchoolSection;
  defaultId: string;
  templates: ReportCardTemplate[];
}

/** Every template a school can use, per section, with each section's default. */
export async function listTemplates(schoolId: string, onlySection?: SchoolSection): Promise<TemplateListing[]> {
  const sections = sectionsOf(await levelsForSchool(schoolId)).filter((s) => !onlySection || s === onlySection);
  const { rows } = await pool.query<TemplateRow>(
    `select id, section, name, kind, design, updated_at from report_card_template
      where school_id = $1 order by lower(name)`,
    [schoolId],
  );
  const defaults = await defaultRefs(schoolId);
  return sections.map((section) => {
    const own = rows.filter((r) => r.section === section).map(fromRow);
    const templates = [...BUILT_INS.map((b) => builtInTemplate(b, section)), ...own];
    const saved = defaults.get(section);
    const defaultId = saved && templates.some((t) => t.id === saved) ? saved : `${BUILTIN_PREFIX}${DEFAULT_BUILTIN}`;
    return { section, defaultId, templates };
  });
}

/** The template a section's report card prints with: the one asked for if it's
 * usable, else the section's default, else Classic. */
export async function resolveTemplate(schoolId: string, section: SchoolSection, ref?: string | null): Promise<ResolvedTemplate> {
  let template = ref ? await findTemplate(schoolId, section, ref) : null;
  if (!template) {
    const saved = (await defaultRefs(schoolId)).get(section);
    template = saved ? await findTemplate(schoolId, section, saved) : null;
  }
  template ??= builtInTemplate(BUILT_INS.find((b) => b.key === DEFAULT_BUILTIN)!, section);
  return { ...template, fields: reportCardFieldsOf(section, template.design.fields) };
}

async function assertSection(schoolId: string, section: SchoolSection): Promise<void> {
  const sections = sectionsOf(await levelsForSchool(schoolId));
  if (!sections.includes(section)) throw new InvalidTemplateError("Unknown section.");
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new InvalidTemplateError("Give the template a name.");
  if (trimmed.length > 60) throw new InvalidTemplateError("Keep the name under 60 characters.");
  return trimmed;
}

function rethrowNameTaken(err: unknown): never {
  if (isRecord(err) && err.constraint === "report_card_template_name_unique") {
    throw new InvalidTemplateError("This section already has a template with that name.");
  }
  throw err;
}

export async function createTemplate(
  schoolId: string,
  input: { section: SchoolSection; name: string; kind: TemplateKind; design: unknown },
): Promise<ReportCardTemplate> {
  await assertSection(schoolId, input.section);
  const { rows: count } = await pool.query<{ n: number }>(
    `select count(*)::int as n from report_card_template where school_id = $1`,
    [schoolId],
  );
  if (count[0].n >= 60) throw new InvalidTemplateError("A school can keep up to 60 templates. Delete one you no longer use.");
  const design = normalizeDesign(input.section, input.kind, input.design);
  try {
    const { rows } = await pool.query<TemplateRow>(
      `insert into report_card_template (school_id, section, name, kind, design)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id, section, name, kind, design, updated_at`,
      [schoolId, input.section, cleanName(input.name), input.kind, JSON.stringify(design)],
    );
    return fromRow(rows[0]);
  } catch (err) {
    rethrowNameTaken(err);
  }
}

export async function updateTemplate(
  schoolId: string,
  id: string,
  input: { name?: string; design?: unknown },
): Promise<ReportCardTemplate | null> {
  const current = await ownTemplate(schoolId, id);
  if (!current) return null;
  const name = input.name !== undefined ? cleanName(input.name) : current.name;
  const design = input.design !== undefined ? normalizeDesign(current.section, current.kind, input.design) : current.design;
  try {
    const { rows } = await pool.query<TemplateRow>(
      `update report_card_template set name = $3, design = $4::jsonb, updated_at = now()
        where school_id = $1 and id = $2
        returning id, section, name, kind, design, updated_at`,
      [schoolId, id, name, JSON.stringify(design)],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch (err) {
    rethrowNameTaken(err);
  }
}

/** Deleting a section's default puts that section back on Classic. */
export async function deleteTemplate(schoolId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`delete from report_card_template where school_id = $1 and id = $2`, [schoolId, id]);
    await client.query(
      `update school_section set report_card_template = null, updated_at = now()
        where school_id = $1 and report_card_template = $2`,
      [schoolId, id],
    );
    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setDefaultTemplate(schoolId: string, section: SchoolSection, ref: string): Promise<void> {
  await assertSection(schoolId, section);
  const template = await findTemplate(schoolId, section, ref);
  if (!template) throw new InvalidTemplateError("That template isn't available for this section.");
  await pool.query(
    `insert into school_section (school_id, section, report_card_template)
     values ($1, $2, $3)
     on conflict (school_id, section) do update set report_card_template = excluded.report_card_template, updated_at = now()`,
    [schoolId, section, template.id],
  );
}

/** What a section's report card prints with: positions on or off (a section
 * setting) and the template, chosen or the section's default. */
export async function reportCardSettingsFor(
  schoolId: string,
  section: SchoolSection,
  templateRef?: string | null,
): Promise<{ showPositions: boolean; fields: ReportCardFields; template: ResolvedTemplate }> {
  const [showPositions, template] = await Promise.all([
    showPositionsFor(schoolId, section),
    resolveTemplate(schoolId, section, templateRef),
  ]);
  return { showPositions, fields: template.fields, template };
}
