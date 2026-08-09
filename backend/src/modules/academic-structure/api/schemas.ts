const errorResponseSchema = {
  type: "object",
  properties: { error: { type: "string" } },
} as const;

// -- Academic levels ---------------------------------------------------------

export const academicLevelBodySchema = {
  type: "object",
  required: ["code", "name"],
  properties: {
    code: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    sortOrder: { type: "number" },
    stage: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const academicLevelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    sortOrder: { type: "number" },
    stage: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const listAcademicLevelsResponseSchema = {
  200: { type: "array", items: academicLevelSchema },
} as const;

export const academicLevelResponseSchema = {
  200: academicLevelSchema,
  404: errorResponseSchema,
} as const;

// -- Academic years -----------------------------------------------------------

export const academicYearBodySchema = {
  type: "object",
  required: ["yearName", "startDate", "endDate"],
  properties: {
    yearName: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const academicYearSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    yearName: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const listAcademicYearsResponseSchema = {
  200: { type: "array", items: academicYearSchema },
} as const;

export const academicYearResponseSchema = {
  200: academicYearSchema,
  404: errorResponseSchema,
} as const;

// -- Terms --------------------------------------------------------------------

export const termBodySchema = {
  type: "object",
  required: ["academicYearId", "name", "startDate", "endDate"],
  properties: {
    academicYearId: { type: "string" },
    name: { type: "string", minLength: 1 },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const termSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    academicYearId: { type: "string" },
    name: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    isCurrent: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const listTermsResponseSchema = {
  200: { type: "array", items: termSchema },
} as const;

export const termResponseSchema = {
  200: termSchema,
  400: errorResponseSchema,
  404: errorResponseSchema,
} as const;

// -- Classes --------------------------------------------------------------------

export const classBodySchema = {
  type: "object",
  required: ["academicYearId", "academicLevelId"],
  properties: {
    academicYearId: { type: "string" },
    academicLevelId: { type: "string" },
    hasStreams: { type: "boolean" },
    classTeacherId: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const classSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    academicYearId: { type: "string" },
    academicLevelId: { type: "string" },
    hasStreams: { type: "boolean" },
    classTeacherId: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const listClassesResponseSchema = {
  200: { type: "array", items: classSchema },
} as const;

export const classResponseSchema = {
  200: classSchema,
  404: errorResponseSchema,
} as const;

// -- Streams ----------------------------------------------------------------------

export const streamBodySchema = {
  type: "object",
  required: ["classId", "name"],
  properties: {
    classId: { type: "string" },
    name: { type: "string", minLength: 1 },
    streamTeacherId: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const streamSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    classId: { type: "string" },
    name: { type: "string" },
    streamTeacherId: { type: ["string", "null"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const listStreamsResponseSchema = {
  200: { type: "array", items: streamSchema },
} as const;

export const streamResponseSchema = {
  200: streamSchema,
  404: errorResponseSchema,
} as const;
