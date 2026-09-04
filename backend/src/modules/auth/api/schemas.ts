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

export const forgotPasswordBodySchema = {
  type: "object",
  required: ["identifier"],
  properties: {
    identifier: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const resetPasswordBodySchema = {
  type: "object",
  required: ["token", "newPassword"],
  properties: {
    token: { type: "string", minLength: 1 },
    newPassword: { type: "string", minLength: 8 },
  },
  additionalProperties: false,
} as const;

// Shared by both reset endpoints: 200 carries a human message, 400 an error code.
export const messageResponseSchema = {
  200: {
    type: "object",
    properties: { message: { type: "string" } },
  },
  400: {
    type: "object",
    properties: { error: { type: "string" } },
  },
} as const;

export const meResponseSchema = {
  200: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      phoneNumber: { type: ["string", "null"] },
      systemId: { type: ["string", "null"] },
      role: { type: "string" },
      schoolId: { type: ["string", "null"] },
      mustChangePassword: { type: "boolean" },
    },
  },
  404: {
    type: "object",
    properties: { error: { type: "string" } },
  },
} as const;
