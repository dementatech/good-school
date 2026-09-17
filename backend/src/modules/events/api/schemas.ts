const eventProps = {
  title: { type: "string", minLength: 1 },
  description: { type: ["string", "null"] },
  eventDate: { type: "string", format: "date" },
  eventType: { type: "string", enum: ["holiday", "exam", "meeting", "deadline", "other"] },
  audience: { type: "string", enum: ["all", "staff", "students", "parents"] },
} as const;

export const createEventBodySchema = {
  type: "object",
  required: ["title", "eventDate", "eventType", "audience"],
  properties: eventProps,
  additionalProperties: false,
} as const;

export const updateEventBodySchema = createEventBodySchema;

export const listEventsQuerySchema = {
  type: "object",
  required: ["from", "to"],
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
  },
} as const;
