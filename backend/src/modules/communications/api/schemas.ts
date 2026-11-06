const uuid = { type: "string", format: "uuid" } as const;

export const startDirectBodySchema = {
  type: "object",
  required: ["userId"],
  properties: { userId: uuid },
  additionalProperties: false,
} as const;

export const createGroupBodySchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: ["string", "null"], maxLength: 500 },
    onlyAdminsPost: { type: "boolean" },
    memberUserIds: { type: "array", items: uuid, maxItems: 2000 },
  },
  additionalProperties: false,
} as const;

export const updateRoomBodySchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: ["string", "null"], maxLength: 500 },
    onlyAdminsPost: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const addMembersBodySchema = {
  type: "object",
  required: ["userIds"],
  properties: { userIds: { type: "array", items: uuid, minItems: 1, maxItems: 2000 } },
  additionalProperties: false,
} as const;

export const memberRoleBodySchema = {
  type: "object",
  required: ["role"],
  properties: { role: { type: "string", enum: ["admin", "member"] } },
  additionalProperties: false,
} as const;

export const muteBodySchema = {
  type: "object",
  required: ["muted"],
  properties: { muted: { type: "boolean" } },
  additionalProperties: false,
} as const;

export const postMessageBodySchema = {
  type: "object",
  required: ["body"],
  properties: {
    body: { type: "string", minLength: 1, maxLength: 4000 },
    replyToId: { anyOf: [uuid, { type: "null" }] },
  },
  additionalProperties: false,
} as const;

export const editMessageBodySchema = {
  type: "object",
  required: ["body"],
  properties: { body: { type: "string", maxLength: 4000 } },
  additionalProperties: false,
} as const;

export const reactionBodySchema = {
  type: "object",
  required: ["emoji"],
  properties: { emoji: { type: "string", minLength: 1, maxLength: 16 } },
  additionalProperties: false,
} as const;
