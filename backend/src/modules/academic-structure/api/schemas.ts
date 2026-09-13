// Body validation for the academic-structure routes. Responses all use the
// shared `{ success, data }` envelope (see src/shared/envelope.ts), so route
// response schemas are intentionally loose.

// ── Reference data (super_admin) ─────────────────────────────────────────────

export const curriculumBodySchema = {
  type: "object",
  required: ["code", "name"],
  properties: {
    code: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    awardingBody: { type: ["string", "null"] },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const stageBodySchema = {
  type: "object",
  required: ["code", "name", "sequenceNumber"],
  properties: {
    code: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    sequenceNumber: { type: "integer", minimum: 1 },
    phase: { type: ["string", "null"] },
    ageEquivalentYears: { type: ["integer", "null"] },
  },
  additionalProperties: false,
} as const;

export const subjectBodySchema = {
  type: "object",
  required: ["phase", "shortName", "name"],
  properties: {
    phase: { type: "string", enum: ["O_LEVEL", "A_LEVEL"] },
    // Short, human-typed abbreviation (e.g. "Phy") — combination names
    // concatenate this. `code` (S001, ...) is system-assigned, never in the body.
    shortName: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    category: {
      type: "string",
      enum: [
        "language",
        "science",
        "art",
        "subsidiary",
        "vocational",
        "core",
        "religion",
        "special",
      ],
    },
    isExaminable: { type: "boolean" },
    isActive: { type: "boolean" },
    stageIds: { type: "array", items: { type: "string" } },
    // Omit both to leave the variant configuration untouched on an update.
    hasVariant: { type: "boolean" },
    variants: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "code", "contributionPercent"],
        properties: {
          id: { type: "string" },
          name: { type: "string", minLength: 1 },
          code: { type: "string", minLength: 1 },
          contributionPercent: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const combinationBodySchema = {
  type: "object",
  required: [],
  properties: {
    // Optional — `code` is system-assigned (C001, ...) when omitted. The name
    // is not accepted at all: it's derived from the member subjects on read.
    code: { type: "string" },
    description: { type: ["string", "null"] },
    isActive: { type: "boolean" },
    subjects: {
      type: "array",
      items: {
        type: "object",
        required: ["subjectId", "role"],
        properties: {
          subjectId: { type: "string" },
          role: { type: "string", enum: ["principal", "subsidiary", "compulsory"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

// ── Per-school ──────────────────────────────────────────────────────────────

export const schoolCurriculumBodySchema = {
  type: "object",
  required: ["curriculumId"],
  properties: { curriculumId: { type: "string" } },
  additionalProperties: false,
} as const;

export const academicYearBodySchema = {
  type: "object",
  required: ["yearName", "startDate", "endDate"],
  properties: {
    yearName: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
    makeCurrent: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const termBodySchema = {
  type: "object",
  required: ["academicYearId", "name", "startDate", "endDate"],
  properties: {
    academicYearId: { type: "string" },
    termNumber: { type: ["integer", "null"], minimum: 1, maximum: 3 },
    name: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const classBodySchema = {
  type: "object",
  required: ["academicYearId", "curriculumStageId"],
  properties: {
    academicYearId: { type: "string" },
    curriculumStageId: { type: "string" },
    hasStreams: { type: "boolean" },
    classTeacherId: { type: ["string", "null"] },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const streamBodySchema = {
  type: "object",
  required: ["classId", "name"],
  properties: {
    classId: { type: "string" },
    name: { type: "string", minLength: 1 },
    streamTeacherId: { type: ["string", "null"] },
    capacity: { type: ["integer", "null"], minimum: 1 },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const subjectOfferingBodySchema = {
  type: "object",
  required: ["subjectId", "isOffered", "isCompulsory"],
  properties: {
    subjectId: { type: "string" },
    isOffered: { type: "boolean" },
    isCompulsory: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const schoolCombinationMemberSchema = {
  type: "object",
  required: ["subjectId", "role"],
  properties: {
    subjectId: { type: "string" },
    role: { type: "string", enum: ["principal", "subsidiary", "compulsory"] },
  },
  additionalProperties: false,
} as const;

export const schoolCombinationBodySchema = {
  type: "object",
  required: [],
  properties: {
    catalogCombinationId: { type: ["string", "null"] },
    code: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    isOffered: { type: "boolean" },
    minClassSize: { type: ["integer", "null"], minimum: 1 },
    subjects: { type: "array", items: schoolCombinationMemberSchema },
  },
  additionalProperties: false,
} as const;

// -- Grading schemes (school_admin/admin, per school) ------------------------
// Exams roadmap Step 2. Free-text `regime`/`appliesTo` — see
// grading-schemes.repository.ts header.

const gradeBandSchema = {
  type: "object",
  required: ["label", "minPct", "maxPct", "comment"],
  properties: {
    label: { type: "string", minLength: 1 },
    minPct: { type: "number", minimum: 0, maximum: 100 },
    maxPct: { type: "number", minimum: 0, maximum: 100 },
    points: { type: ["integer", "null"] },
    legacyEquivalent: { type: ["string", "null"] },
    // Shown on the report card — distinct from the short `label`.
    comment: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

// curriculumId is a query param on create (POST /grading-schemes?curriculumId=…),
// not part of the body — same precedent as subjects. appliesTo/roleScope are
// fixed at creation (grading-schemes.repository.ts ignores them on update).
export const gradingSchemeBodySchema = {
  type: "object",
  required: ["regime", "appliesTo", "name", "bands"],
  properties: {
    regime: { type: "string", minLength: 1 },
    appliesTo: { type: "string", enum: ["O_LEVEL", "A_LEVEL"] },
    // Omit for O-Level (forced to 'any'). Required in practice for a real
    // A-Level scheme — principal and subsidiary subjects use different bands.
    roleScope: { type: "string", enum: ["any", "principal", "subsidiary"] },
    name: { type: "string", minLength: 1 },
    isActive: { type: "boolean" },
    bands: { type: "array", items: gradeBandSchema, minItems: 1 },
  },
  additionalProperties: false,
} as const;

// A school picking which catalog scheme applies to one phase/role.
export const schoolGradingSchemeBodySchema = {
  type: "object",
  required: ["appliesTo", "roleScope", "gradingSchemeId"],
  properties: {
    appliesTo: { type: "string", enum: ["O_LEVEL", "A_LEVEL"] },
    roleScope: { type: "string", enum: ["any", "principal", "subsidiary"] },
    gradingSchemeId: { type: "string" },
  },
  additionalProperties: false,
} as const;
