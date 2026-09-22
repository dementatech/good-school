export const broadcastTeachersBodySchema = {
  type: "object",
  required: ["title", "body"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;

export const broadcastClassBodySchema = {
  type: "object",
  required: ["classId", "title", "body"],
  properties: {
    classId: { type: "string" },
    streamId: { type: ["string", "null"] },
    title: { type: "string", minLength: 1, maxLength: 200 },
    body: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;

export const startConversationBodySchema = {
  type: "object",
  required: ["teacherUserId"],
  properties: {
    teacherUserId: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const postMessageBodySchema = {
  type: "object",
  required: ["body"],
  properties: {
    body: { type: "string", minLength: 1, maxLength: 4000 },
  },
  additionalProperties: false,
} as const;
