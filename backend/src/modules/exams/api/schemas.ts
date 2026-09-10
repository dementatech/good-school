// Body validation for the exams routes. Responses use the shared
// { success, data } envelope (src/shared/envelope.ts), so response schemas
// are left loose. Style follows academic-structure/api/schemas.ts.

export const examSessionBodySchema = {
  type: "object",
  required: ["examName", "examCode"],
  properties: {
    examName: { type: "string", minLength: 1 },
    examCode: { type: "string", minLength: 1 },
    description: { type: ["string", "null"] },
    isActive: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

// Dates are ISO date strings ("YYYY-MM-DD"). The repo (and a DB check
// constraint) enforce start <= end <= marksDue.
export const schoolExamBodySchema = {
  type: "object",
  required: ["examSessionId", "startsOn", "endsOn", "marksDueOn"],
  properties: {
    examSessionId: { type: "string", minLength: 1 },
    name: { type: ["string", "null"] },
    startsOn: { type: "string", minLength: 1 },
    endsOn: { type: "string", minLength: 1 },
    marksDueOn: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const schoolExamUpdateBodySchema = {
  type: "object",
  required: ["startsOn", "endsOn", "marksDueOn"],
  properties: {
    name: { type: ["string", "null"] },
    startsOn: { type: "string", minLength: 1 },
    endsOn: { type: "string", minLength: 1 },
    marksDueOn: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;
