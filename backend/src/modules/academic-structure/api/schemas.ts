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
  required: ["phase", "code", "name"],
  properties: {
    phase: { type: "string", enum: ["O_LEVEL", "A_LEVEL"] },
    code: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    category: {
      type: "string",
      enum: ["language", "science", "humanity", "vocational", "core", "general"],
    },
    isExaminable: { type: "boolean" },
    isActive: { type: "boolean" },
    stageIds: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;

export const combinationBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    // Optional — derived from the principal subjects' codes when omitted, so
    // the code always reflects real picks rather than a typed guess.
    code: { type: "string" },
    name: { type: "string", minLength: 1 },
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
    isCurrent: { type: "boolean" },
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
