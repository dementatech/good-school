const section = { type: "string", enum: ["KINDERGARTEN", "PRIMARY", "SECONDARY"] } as const;
const uuid = { type: "string", format: "uuid" } as const;
const nullableUuid = { type: ["string", "null"], format: "uuid" } as const;

export const periodsBodySchema = {
  type: "object",
  required: ["section", "periods", "days"],
  properties: {
    section,
    days: { type: "array", items: { type: "integer", minimum: 1, maximum: 6 }, minItems: 1, maxItems: 6 },
    periods: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        required: ["label", "startTime", "endTime", "kind"],
        properties: {
          id: uuid,
          label: { type: "string", minLength: 1, maxLength: 60 },
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          kind: { type: "string", enum: ["lesson", "break", "lunch", "assembly", "other"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const slotBodySchema = {
  type: "object",
  required: ["termId", "classId", "dayOfWeek", "periodId"],
  properties: {
    termId: uuid,
    classId: uuid,
    streamId: nullableUuid,
    dayOfWeek: { type: "integer", minimum: 1, maximum: 6 },
    periodId: uuid,
    subjectId: nullableUuid,
    activity: { type: ["string", "null"], maxLength: 80 },
    staffId: nullableUuid,
    room: { type: ["string", "null"], maxLength: 40 },
  },
  additionalProperties: false,
} as const;

export const copyBodySchema = {
  type: "object",
  required: ["fromTermId", "toTermId"],
  properties: { fromTermId: uuid, toTermId: uuid },
  additionalProperties: false,
} as const;

export const generateBodySchema = {
  type: "object",
  required: ["termId", "section"],
  properties: {
    termId: uuid,
    section,
    lessonsPerWeek: {
      type: "object",
      propertyNames: { format: "uuid" },
      additionalProperties: { type: "integer", minimum: 0, maximum: 20 },
    },
    keepExisting: { type: "boolean" },
    seed: { type: "integer", minimum: 0, maximum: 2147483647 },
  },
  additionalProperties: false,
} as const;

export const applyGeneratedBodySchema = {
  type: "object",
  required: ["termId", "section", "lessons"],
  properties: {
    termId: uuid,
    section,
    keepExisting: { type: "boolean" },
    lessons: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        required: ["classId", "streamId", "dayOfWeek", "periodId", "subjectId", "staffId"],
        properties: {
          classId: uuid,
          streamId: nullableUuid,
          dayOfWeek: { type: "integer", minimum: 1, maximum: 6 },
          periodId: uuid,
          subjectId: uuid,
          staffId: nullableUuid,
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;
