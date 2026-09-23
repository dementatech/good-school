const uuid = { type: "string", format: "uuid" } as const;
const nullableUuid = { type: ["string", "null"], format: "uuid" } as const;
const text = (max = 4000) => ({ type: ["string", "null"], maxLength: max }) as const;

export const schemeBodySchema = {
  type: "object",
  required: ["termId", "classId", "subjectId"],
  properties: { termId: uuid, classId: uuid, subjectId: uuid },
  additionalProperties: false,
} as const;

export const schemeWeeksBodySchema = {
  type: "object",
  required: ["weeks"],
  properties: {
    weeks: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        required: ["weekNumber"],
        properties: {
          weekNumber: { type: "integer", minimum: 1, maximum: 30 },
          topic: text(300),
          subTopic: text(300),
          competences: text(),
          methods: text(),
          materials: text(),
          references: text(),
          remarks: text(),
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const reviewBodySchema = {
  type: "object",
  required: ["decision"],
  properties: {
    decision: { type: "string", enum: ["approve", "return"] },
    comment: text(2000),
  },
  additionalProperties: false,
} as const;

export const recordWorkBodySchema = {
  type: "object",
  required: ["workCovered", "coverage", "coverageRemarks"],
  properties: {
    workCovered: text(),
    coverage: { type: ["string", "null"], enum: ["covered", "partly", "not_covered", null] },
    coverageRemarks: text(2000),
  },
  additionalProperties: false,
} as const;

export const lessonPlanBodySchema = {
  type: "object",
  required: ["classId", "lessonDate", "topic"],
  properties: {
    classId: uuid,
    streamId: nullableUuid,
    subjectId: nullableUuid,
    timetableSlotId: nullableUuid,
    schemeWeekId: nullableUuid,
    lessonDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    topic: { type: "string", minLength: 1, maxLength: 300 },
    subTopic: text(300),
    objectives: text(),
    materials: text(),
    introduction: text(),
    development: text(),
    conclusion: text(),
    assessment: text(),
    selfEvaluation: text(),
  },
  additionalProperties: false,
} as const;
