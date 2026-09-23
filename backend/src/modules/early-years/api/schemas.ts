export const learningAreaBodySchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: ["string", "null"], maxLength: 500 },
    sortOrder: { type: "integer" },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const sheetQuerySchema = {
  type: "object",
  required: ["classId", "termId"],
  properties: {
    classId: { type: "string", format: "uuid" },
    termId: { type: "string", format: "uuid" },
    streamId: { type: "string" },
    studentUserId: { type: "string" },
  },
} as const;

const nullableComment = { type: ["string", "null"], maxLength: 1000 } as const;

export const assessmentSheetBodySchema = {
  type: "object",
  required: ["classId", "termId"],
  properties: {
    classId: { type: "string", format: "uuid" },
    termId: { type: "string", format: "uuid" },
    entries: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        required: ["studentUserId", "learningAreaId", "rating"],
        properties: {
          studentUserId: { type: "string", format: "uuid" },
          learningAreaId: { type: "string", format: "uuid" },
          rating: { type: ["string", "null"], enum: ["emerging", "developing", "proficient", null] },
          teacherComment: nullableComment,
        },
        additionalProperties: false,
      },
    },
    remarks: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        required: ["studentUserId"],
        properties: {
          studentUserId: { type: "string", format: "uuid" },
          classTeacherComment: nullableComment,
          headTeacherComment: nullableComment,
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;
