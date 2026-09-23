import { pool } from "../../../shared/db/index.js";

// Kindergarten is taught through thematic, play-based learning areas, not
// examinable subjects (docs/design/kindergarten-extension.md §4) — so a
// light, per-school list instead of the subject/offering machinery. Seeded
// with defaults the first time a school opens it; the nursery curriculum is
// itself under revision (§5), so every school can rename/add/retire freely.

export interface LearningAreaRecord {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface LearningAreaInput {
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

interface LearningAreaRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

const mapRow = (r: LearningAreaRow): LearningAreaRecord => ({
  id: r.id,
  name: r.name,
  description: r.description,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

// Modelled on the NCDC early-childhood learning framework's areas.
const DEFAULT_LEARNING_AREAS: { name: string; description: string }[] = [
  { name: "Language & Communication", description: "Listening, speaking and expressing ideas" },
  { name: "Reading Readiness", description: "Letter sounds, picture reading, recognising words" },
  { name: "Writing Readiness", description: "Pencil grip, tracing, patterns and letter formation" },
  { name: "Mathematical Concepts", description: "Counting, number recognition, shapes, sorting" },
  { name: "Our Environment", description: "Home, school, plants, animals and weather" },
  { name: "Health Habits", description: "Personal hygiene, safety and feeding" },
  { name: "Relating with Others", description: "Sharing, taking turns, manners and self-control" },
  { name: "Creative Arts & Music", description: "Drawing, colouring, songs, rhymes and dance" },
  { name: "Physical Development", description: "Running, jumping, balance and fine-motor skills" },
];

const SELECT = `select id, name, description, sort_order, is_active from learning_area`;

export class DuplicateLearningAreaError extends Error {
  constructor() {
    super("A learning area with that name already exists.");
    this.name = "DuplicateLearningAreaError";
  }
}

export class LearningAreaInUseError extends Error {
  constructor() {
    super("This learning area already has recorded assessments — deactivate it instead.");
    this.name = "LearningAreaInUseError";
  }
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

async function ensureDefaults(schoolId: string): Promise<void> {
  const { rowCount } = await pool.query(`select 1 from learning_area where school_id = $1 limit 1`, [schoolId]);
  if ((rowCount ?? 0) > 0) return;
  await pool.query(
    `insert into learning_area (school_id, name, description, sort_order)
     select $1, d.name, d.description, d.ord::int
       from unnest($2::text[], $3::text[]) with ordinality as d(name, description, ord)
     on conflict do nothing`,
    [schoolId, DEFAULT_LEARNING_AREAS.map((a) => a.name), DEFAULT_LEARNING_AREAS.map((a) => a.description)],
  );
}

export async function listLearningAreas(
  schoolId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<LearningAreaRecord[]> {
  await ensureDefaults(schoolId);
  const { rows } = await pool.query<LearningAreaRow>(
    `${SELECT} where school_id = $1 ${opts.activeOnly ? "and is_active" : ""} order by sort_order, name`,
    [schoolId],
  );
  return rows.map(mapRow);
}

export async function createLearningArea(schoolId: string, input: LearningAreaInput): Promise<LearningAreaRecord> {
  try {
    const { rows } = await pool.query<LearningAreaRow>(
      `insert into learning_area (school_id, name, description, sort_order, is_active)
       values ($1, $2, $3,
               coalesce($4, (select coalesce(max(sort_order), 0) + 1 from learning_area where school_id = $1)),
               $5)
       returning id, name, description, sort_order, is_active`,
      [schoolId, input.name.trim(), input.description?.trim() || null, input.sortOrder ?? null, input.isActive ?? true],
    );
    return mapRow(rows[0]);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateLearningAreaError();
    throw err;
  }
}

export async function updateLearningArea(
  schoolId: string,
  id: string,
  input: LearningAreaInput,
): Promise<LearningAreaRecord | null> {
  try {
    const { rows } = await pool.query<LearningAreaRow>(
      `update learning_area
          set name = $3, description = $4, sort_order = coalesce($5, sort_order),
              is_active = coalesce($6, is_active), updated_at = now()
        where school_id = $1 and id = $2
        returning id, name, description, sort_order, is_active`,
      [schoolId, id, input.name.trim(), input.description?.trim() || null, input.sortOrder ?? null, input.isActive ?? null],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateLearningAreaError();
    throw err;
  }
}

export async function deleteLearningArea(schoolId: string, id: string): Promise<boolean> {
  const used = await pool.query(
    `select 1 from developmental_assessment where learning_area_id = $1 and rating is not null limit 1`,
    [id],
  );
  if ((used.rowCount ?? 0) > 0) throw new LearningAreaInUseError();
  const { rowCount } = await pool.query(`delete from learning_area where school_id = $1 and id = $2`, [schoolId, id]);
  return (rowCount ?? 0) > 0;
}
