export const loginBodySchema = {
  type: "object",
  required: ["identifier", "password"],
  properties: {
    identifier: { type: "string", minLength: 1 },
    password: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const loginResponseSchema = {
  200: {
    type: "object",
    properties: {
      role: { type: "string" },
      school_id: { type: ["string", "null"] },
    },
  },
  401: {
    type: "object",
    properties: {
      error: { type: "string" },
    },
  },
} as const;

export const meResponseSchema = {
  200: {
    type: "object",
    properties: {
      email: { type: ["string", "null"] },
      phoneNumber: { type: ["string", "null"] },
      systemId: { type: ["string", "null"] },
      role: { type: "string" },
      schoolId: { type: ["string", "null"] },
    },
  },
  404: {
    type: "object",
    properties: { error: { type: "string" } },
  },
} as const;
