export const registerBodySchema = {
  type: "object",
  required: ["classId", "date", "entries"],
  properties: {
    classId: { type: "string", format: "uuid" },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    entries: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        required: ["studentUserId", "status"],
        properties: {
          studentUserId: { type: "string", format: "uuid" },
          status: { type: ["string", "null"], enum: ["present", "absent", "late", "excused", null] },
          reason: { type: ["string", "null"], maxLength: 300 },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;
