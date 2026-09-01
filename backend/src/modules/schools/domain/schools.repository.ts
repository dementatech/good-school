import { pool } from "../../../shared/db/index.js";

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
  emisCode: string | null;
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
  offersOLevel: boolean;
  offersALevel: boolean;
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
  emisCode?: string | null;
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
  offersOLevel?: boolean;
  offersALevel?: boolean;
  dataImportSource?: DataImportSource | null;
}

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
  emis_code: string | null;
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
  offers_o_level: boolean;
  offers_a_level: boolean;
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
    emisCode: r.emis_code,
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
    offersOLevel: r.offers_o_level,
    offersALevel: r.offers_a_level,
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
         ) as curricula
  from schools s
`;

// Column list for INSERT/UPDATE, mapping camelCase input -> snake_case column.
const WRITABLE = [
  ["name", "name"],
  ["legalName", "legal_name"],
  ["slug", "slug"],
  ["emisCode", "emis_code"],
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
  const values: Record<string, unknown> = { slug: input.slug || slugify(input.name) };
  for (const [inKey, col] of WRITABLE) {
    if (col === "slug") continue;
    const v = (input as unknown as Record<string, unknown>)[inKey];
    if (v !== undefined) values[col] = v;
  }
  const cols = Object.keys(values);
  const params = Object.values(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`);

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into schools (${cols.join(", ")}) values (${placeholders.join(", ")}) returning id`,
      params,
    );
    return (await getSchool(rows[0].id))!;
  } catch (err) {
    rethrowUnique(err);
  }
}

export async function updateSchool(
  id: string,
  input: Partial<SchoolInput>,
): Promise<SchoolRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [inKey, col] of WRITABLE) {
    const v = (input as unknown as Record<string, unknown>)[inKey];
    if (v !== undefined) {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getSchool(id);
  sets.push(`updated_at = now()`);
  params.push(id);

  try {
    const { rowCount } = await pool.query(
      `update schools set ${sets.join(", ")} where id = $${params.length}`,
      params,
    );
    return rowCount ? getSchool(id) : null;
  } catch (err) {
    rethrowUnique(err);
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
