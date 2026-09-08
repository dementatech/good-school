export const accountTypeParamsSchema = {
  type: "object",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["school-admins", "staff", "students", "super-admins"],
    },
  },
} as const;

export const updateAccountBodySchema = {
  type: "object",
  properties: {
    isActive: { type: "boolean" },
    email: { type: ["string", "null"] },
    phoneNumber: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

export const resetPasswordsBodySchema = {
  type: "object",
  required: ["userIds"],
  properties: {
    userIds: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;
