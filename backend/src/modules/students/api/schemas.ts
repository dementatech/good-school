export const studentBodySchema = {
  type: "object",
  required: ["fullName"],
  properties: {
    fullName: { type: "string", minLength: 1 },
    dateOfBirth: { type: ["string", "null"] },
    className: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phoneNumber: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const studentSchema = {
  type: "object",
  properties: {
    userId: { type: "string" },
    systemId: { type: ["string", "null"] },
    fullName: { type: "string" },
    dateOfBirth: { type: ["string", "null"] },
    className: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phoneNumber: { type: ["string", "null"] },
    enrolledAt: { type: "string" },
  },
} as const;

export const listStudentsResponseSchema = {
  200: { type: "array", items: studentSchema },
} as const;

export const studentResponseSchema = {
  200: studentSchema,
  404: { type: "object", properties: { error: { type: "string" } } },
} as const;

export const createStudentResponseSchema = {
  201: {
    type: "object",
    properties: {
      student: studentSchema,
      tempPassword: { type: "string" },
    },
  },
} as const;
