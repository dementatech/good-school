import type { PoolClient } from "pg";
import { LEVEL_LABEL, sectionsOf, type SchoolLevel, type SchoolSection } from "../../../shared/levels.js";
import { pool } from "../../../shared/db/index.js";
import {
  deleteStoredFile,
  fileUrl,
  storeFile,
  UnsupportedFileTypeError,
  type StorageProvider,
} from "../../../shared/media.js";
import { DEFAULT_PRIMARY_COLOR } from "./theme.repository.js";

// The school tenant record — see frontend/components/school-onboarding-enrollment.md §2.

export type OwnershipType =
  | "government"
  | "private"
  | "community"
  | "religious"
  | "international";
export type RegistrationStatus = "registered" | "licensed" | "provisional" | "unregistered";
export type SchoolType = "day" | "boarding" | "mixed";
export type GenderComposition = "boys" | "girls" | "mixed";
export type OnboardingStatus = "pending_verification" | "active" | "suspended" | "churned";
export type DataImportSource = "fresh" | "migrated";

export interface SchoolCurriculumRef {
  curriculumId: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface SchoolRecord {
  id: string;
  name: string;
  legalName: string | null;
  slug: string | null;
  /** EMIS number per section — EMIS registers each section (Nursery,
   * Primary, Secondary) as its own institution. Only sections that have one. */
  emisCodes: Partial<Record<SchoolSection, string>>;
  unebCentreNumber: string | null;
  ownershipType: OwnershipType | null;
  registrationStatus: RegistrationStatus | null;
  district: string | null;
  subCounty: string | null;
  address: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  headTeacherName: string | null;
  headTeacherContact: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  schoolType: SchoolType | null;
  genderComposition: GenderComposition | null;
  offersKindergarten: boolean;
  offersPrimary: boolean;
  offersOLevel: boolean;
  offersALevel: boolean;
  /** Served URL for the school's logo, or null for the initials-tile fallback. */
  logoUrl: string | null;
  /** The school's brand colour (theme_config.primaryColor); equals the
   *  design-system default when the school hasn't customised it. */
  primaryColor: string;
  onboardingStatus: OnboardingStatus;
  verifiedAt: string | null;
  dataImportSource: DataImportSource | null;
  schoolGroupId: string | null;
  userCount: number;
  curricula: SchoolCurriculumRef[];
  createdAt: string;
  updatedAt: string;
}

export interface SchoolInput {
  name: string;
  legalName?: string | null;
  slug?: string | null;
  /** Per section; null/"" clears it. Sections the school doesn't run are ignored. */
  emisCodes?: Partial<Record<SchoolSection, string | null>>;
  unebCentreNumber?: string | null;
  ownershipType?: OwnershipType | null;
  registrationStatus?: RegistrationStatus | null;
  district?: string | null;
  subCounty?: string | null;
  address?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  headTeacherName?: string | null;
  headTeacherContact?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  schoolType?: SchoolType | null;
  genderComposition?: GenderComposition | null;
  offersKindergarten?: boolean;
  offersPrimary?: boolean;
  offersOLevel?: boolean;
  offersALevel?: boolean;
  dataImportSource?: DataImportSource | null;
}

export class InvalidSchoolLevelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSchoolLevelsError";
  }
}

// Each level flag and the curriculum_stage.phase it stands for. A school runs
// sections: Nursery, Primary, Nursery + Primary, or Secondary (O and/or
// A-Level) — never Secondary together with Nursery/Primary.
const LEVEL_FLAGS: [keyof SchoolInput, SchoolLevel][] = [
  ["offersKindergarten", "KINDERGARTEN"],
  ["offersPrimary", "PRIMARY"],
  ["offersOLevel", "O_LEVEL"],
  ["offersALevel", "A_LEVEL"],
];

function assertSectionsValid(f: {
  offersKindergarten?: boolean;
  offersPrimary?: boolean;
  offersOLevel?: boolean;
  offersALevel?: boolean;
}): void {
  if ((f.offersKindergarten || f.offersPrimary) && (f.offersOLevel || f.offersALevel)) {
    throw new InvalidSchoolLevelsError(
      "Secondary can't share a school with Nursery or Primary — register it as its own school.",
    );
  }
}

// Saves the EMIS numbers sent for the sections the school runs, and drops the
// row of any section it no longer runs.
async function writeSectionEmis(
  client: PoolClient,
  schoolId: string,
  emisCodes: SchoolInput["emisCodes"],
): Promise<void> {
  const { rows } = await client.query<{
    offers_kindergarten: boolean;
    offers_primary: boolean;
    offers_o_level: boolean;
    offers_a_level: boolean;
  }>(`select offers_kindergarten, offers_primary, offers_o_level, offers_a_level from schools where id = $1`, [schoolId]);
  const f = rows[0];
  const levels: SchoolLevel[] = [
    ...(f.offers_kindergarten ? (["KINDERGARTEN"] as const) : []),
    ...(f.offers_primary ? (["PRIMARY"] as const) : []),
    ...(f.offers_o_level ? (["O_LEVEL"] as const) : []),
    ...(f.offers_a_level ? (["A_LEVEL"] as const) : []),
  ];
  const sections = sectionsOf(levels);
  for (const section of sections) {
    const raw = emisCodes?.[section];
    if (raw === undefined) continue;
    await client.query(
      `insert into school_section (school_id, section, emis_code) values ($1, $2, $3)
       on conflict (school_id, section) do update set emis_code = excluded.emis_code, updated_at = now()`,
      [schoolId, section, raw?.trim() || null],
    );
  }
  await client.query(`delete from school_section where school_id = $1 and not (section = any($2::text[]))`, [
    schoolId,
    sections,
  ]);
}

const isCheckViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23514";

export class UniqueViolationError extends Error {
  constructor(public field: string) {
    super(`A school with this ${field} already exists.`);
    this.name = "UniqueViolationError";
  }
}

interface SchoolRow {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string | null;
  emis_codes: Partial<Record<SchoolSection, string>> | null;
  uneb_centre_number: string | null;
  ownership_type: OwnershipType | null;
  registration_status: RegistrationStatus | null;
  district: string | null;
  sub_county: string | null;
  address: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  head_teacher_name: string | null;
  head_teacher_contact: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  school_type: SchoolType | null;
  gender_composition: GenderComposition | null;
  offers_kindergarten: boolean;
  offers_primary: boolean;
  offers_o_level: boolean;
  offers_a_level: boolean;
  logo_path: string | null;
  logo_provider: StorageProvider | null;
  theme_config: { primaryColor?: string } | null;
  onboarding_status: OnboardingStatus;
  verified_at: string | null;
  data_import_source: DataImportSource | null;
  school_group_id: string | null;
  user_count: string;
  curricula: SchoolCurriculumRef[] | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: SchoolRow): SchoolRecord {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name,
    slug: r.slug,
    emisCodes: r.emis_codes ?? {},
    unebCentreNumber: r.uneb_centre_number,
    ownershipType: r.ownership_type,
    registrationStatus: r.registration_status,
    district: r.district,
    subCounty: r.sub_county,
    address: r.address,
    gpsLat: r.gps_lat === null ? null : Number(r.gps_lat),
    gpsLng: r.gps_lng === null ? null : Number(r.gps_lng),
    headTeacherName: r.head_teacher_name,
    headTeacherContact: r.head_teacher_contact,
    phone: r.phone,
    email: r.email,
    website: r.website,
    schoolType: r.school_type,
    genderComposition: r.gender_composition,
    offersKindergarten: r.offers_kindergarten,
    offersPrimary: r.offers_primary,
    offersOLevel: r.offers_o_level,
    offersALevel: r.offers_a_level,
    // Logos are always images by construction (setSchoolLogo only accepts
    // image/*), so the mimeType passed here only needs to be image-ish for
    // fileUrl() to pick Cloudinary's "image" resource type.
    logoUrl: r.logo_path
      ? fileUrl({ provider: r.logo_provider ?? "local", ref: r.logo_path, mimeType: "image/jpeg" })
      : null,
    primaryColor: r.theme_config?.primaryColor || DEFAULT_PRIMARY_COLOR,
    onboardingStatus: r.onboarding_status,
    verifiedAt: r.verified_at,
    dataImportSource: r.data_import_source,
    schoolGroupId: r.school_group_id,
    userCount: Number(r.user_count),
    curricula: r.curricula ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_SCHOOL = `
  select s.*,
         (select count(*) from users u where u.school_id = s.id) as user_count,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
              'curriculumId', c.id, 'code', c.code, 'name', c.name, 'isPrimary', sc.is_primary
            ) order by c.code)
            from school_curriculum sc join curriculum c on c.id = sc.curriculum_id
            where sc.school_id = s.id),
           '[]'
         ) as curricula,
         (select jsonb_object_agg(ss.section, ss.emis_code)
            from school_section ss
           where ss.school_id = s.id and ss.emis_code is not null) as emis_codes
  from schools s
`;

// Column list for INSERT/UPDATE, mapping camelCase input -> snake_case column.
const WRITABLE = [
  ["name", "name"],
  ["legalName", "legal_name"],
  ["slug", "slug"],
  ["unebCentreNumber", "uneb_centre_number"],
  ["ownershipType", "ownership_type"],
  ["registrationStatus", "registration_status"],
  ["district", "district"],
  ["subCounty", "sub_county"],
  ["address", "address"],
  ["gpsLat", "gps_lat"],
  ["gpsLng", "gps_lng"],
  ["headTeacherName", "head_teacher_name"],
  ["headTeacherContact", "head_teacher_contact"],
  ["phone", "phone"],
  ["email", "email"],
  ["website", "website"],
  ["schoolType", "school_type"],
  ["genderComposition", "gender_composition"],
  ["offersKindergarten", "offers_kindergarten"],
  ["offersPrimary", "offers_primary"],
  ["offersOLevel", "offers_o_level"],
  ["offersALevel", "offers_a_level"],
  ["dataImportSource", "data_import_source"],
] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function rethrowUnique(err: unknown): never {
  if (err && typeof err === "object" && "code" in err && err.code === "23505") {
    const detail = String((err as { detail?: string }).detail ?? "");
    if (detail.includes("emis_code")) throw new UniqueViolationError("EMIS code");
    if (detail.includes("slug")) throw new UniqueViolationError("slug");
    throw new UniqueViolationError("value");
  }
  throw err;
}

export async function listSchools(): Promise<SchoolRecord[]> {
  const { rows } = await pool.query<SchoolRow>(`${SELECT_SCHOOL} order by s.created_at desc`);
  return rows.map(mapRow);
}

export async function getSchool(id: string): Promise<SchoolRecord | null> {
  const { rows } = await pool.query<SchoolRow>(`${SELECT_SCHOOL} where s.id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createSchool(input: SchoolInput): Promise<SchoolRecord> {
  // Levels are always explicit on create — no level is ever assumed.
  input = { ...input };
  for (const [key] of LEVEL_FLAGS) (input as unknown as Record<string, unknown>)[key] ??= false;
  if (!LEVEL_FLAGS.some(([key]) => input[key] === true)) {
    throw new InvalidSchoolLevelsError("Pick at least one level for this school.");
  }
  assertSectionsValid(input);
  const values: Record<string, unknown> = { slug: input.slug || slugify(input.name) };
  for (const [inKey, col] of WRITABLE) {
    if (col === "slug") continue;
    const v = (input as unknown as Record<string, unknown>)[inKey];
    if (v !== undefined) values[col] = v;
  }
  const cols = Object.keys(values);
  const params = Object.values(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `insert into schools (${cols.join(", ")}) values (${placeholders.join(", ")}) returning id`,
      params,
    );
    await writeSectionEmis(client, rows[0].id, input.emisCodes);
    await client.query("COMMIT");
    return (await getSchool(rows[0].id))!;
  } catch (err) {
    await client.query("ROLLBACK");
    if (isCheckViolation(err)) throw new InvalidSchoolLevelsError("Pick at least one level for this school.");
    rethrowUnique(err);
  } finally {
    client.release();
  }
}

export async function updateSchool(
  id: string,
  input: Partial<SchoolInput>,
): Promise<SchoolRecord | null> {
  const cur = await pool.query<{
    offers_kindergarten: boolean;
    offers_primary: boolean;
    offers_o_level: boolean;
    offers_a_level: boolean;
  }>(`select offers_kindergarten, offers_primary, offers_o_level, offers_a_level from schools where id = $1`, [id]);
  if (!cur.rows[0]) return null;
  const c = cur.rows[0];
  assertSectionsValid({
    offersKindergarten: input.offersKindergarten ?? c.offers_kindergarten,
    offersPrimary: input.offersPrimary ?? c.offers_primary,
    offersOLevel: input.offersOLevel ?? c.offers_o_level,
    offersALevel: input.offersALevel ?? c.offers_a_level,
  });

  // Dropping a level the school still has classes at would silently hide
  // those classes (and their pupils' records) — they have to go first.
  for (const [key, level] of LEVEL_FLAGS) {
    if (input[key] !== false) continue;
    const { rowCount } = await pool.query(
      `select 1 from classes c join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where c.school_id = $1 and cs.phase = $2 limit 1`,
      [id, level],
    );
    if (rowCount) {
      throw new InvalidSchoolLevelsError(
        `This school still has ${LEVEL_LABEL[level]} classes — remove them before turning ${LEVEL_LABEL[level]} off.`,
      );
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [inKey, col] of WRITABLE) {
    const v = (input as unknown as Record<string, unknown>)[inKey];
    if (v !== undefined) {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    }
  }
  sets.push(`updated_at = now()`);
  params.push(id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `update schools set ${sets.join(", ")} where id = $${params.length}`,
      params,
    );
    if (rowCount) await writeSectionEmis(client, id, input.emisCodes);
    await client.query("COMMIT");
    return rowCount ? getSchool(id) : null;
  } catch (err) {
    await client.query("ROLLBACK");
    if (isCheckViolation(err)) throw new InvalidSchoolLevelsError("A school must offer at least one level.");
    rethrowUnique(err);
  } finally {
    client.release();
  }
}

export async function setOnboardingStatus(
  id: string,
  status: OnboardingStatus,
): Promise<SchoolRecord | null> {
  const { rowCount } = await pool.query(
    `update schools
       set onboarding_status = $1,
           verified_at = case when $1 = 'active' and verified_at is null then now() else verified_at end,
           updated_at = now()
     where id = $2`,
    [status, id],
  );
  return rowCount ? getSchool(id) : null;
}

/** Every signed-in-capable user of a school — used to force-signout everyone
 *  at once when their school gets suspended. */
export async function listUserIdsForSchool(schoolId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(`select id from users where school_id = $1`, [schoolId]);
  return rows.map((r) => r.id);
}

// Uploads a new logo (replacing and deleting any prior one — via Cloudinary
// when configured, local disk otherwise, see shared/media.ts) or, given `null`,
// clears it back to the initials-tile fallback the frontend renders when
// logoUrl is null. Same shape as teachers' setStaffPhoto.
export async function setSchoolLogo(
  id: string,
  file: { mimeType: string; data: Buffer } | null,
): Promise<SchoolRecord | null> {
  const existing = await pool.query<{
    logo_path: string | null;
    logo_provider: StorageProvider | null;
  }>(`select logo_path, logo_provider from schools where id = $1`, [id]);
  if (!existing.rows[0]) return null;
  const prior = existing.rows[0];

  // Each school's media under its own folder, mirroring staff-documents/<id>.
  const stored = file ? await storeFile(`school-logos/${id}`, file.mimeType, file.data) : null;

  await pool.query(
    `update schools set logo_path = $1, logo_provider = $2, updated_at = now() where id = $3`,
    [stored?.ref ?? null, stored?.provider ?? null, id],
  );

  if (prior.logo_path) {
    await deleteStoredFile({
      provider: prior.logo_provider ?? "local",
      ref: prior.logo_path,
      mimeType: "image/jpeg",
    });
  }

  return getSchool(id);
}

export { UnsupportedFileTypeError };

/** Refuses (returns 'has_users') if the school still has any user accounts. */
export async function deleteSchool(id: string): Promise<"deleted" | "not_found" | "has_users"> {
  const users = await pool.query(`select 1 from users where school_id = $1 limit 1`, [id]);
  if ((users.rowCount ?? 0) > 0) return "has_users";
  const { rowCount } = await pool.query(`delete from schools where id = $1`, [id]);
  return rowCount ? "deleted" : "not_found";
}

/** Used by the auth flow to block login into a suspended tenant. */
export async function findSchoolOnboardingStatus(
  schoolId: string,
): Promise<OnboardingStatus | null> {
  const { rows } = await pool.query<{ onboarding_status: OnboardingStatus }>(
    `select onboarding_status from schools where id = $1`,
    [schoolId],
  );
  return rows[0]?.onboarding_status ?? null;
}

// The bare minimum the portal chrome needs to brand itself for a signed-in
// user (sidebar/topbar name + logo) — see GET /api/v1/auth/me.
export async function findSchoolBrandingById(
  schoolId: string,
): Promise<{ name: string; logoUrl: string | null } | null> {
  const { rows } = await pool.query<{
    name: string;
    logo_path: string | null;
    logo_provider: StorageProvider | null;
  }>(`select name, logo_path, logo_provider from schools where id = $1`, [schoolId]);
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    logoUrl: row.logo_path
      ? fileUrl({ provider: row.logo_provider ?? "local", ref: row.logo_path, mimeType: "image/jpeg" })
      : null,
  };
}
