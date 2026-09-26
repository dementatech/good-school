import { TICKET_KINDS, TICKET_STATUSES } from "../domain/support.repository.js";

export const createTicketBodySchema = {
  type: "object",
  required: ["kind", "subject", "description"],
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [...TICKET_KINDS] },
    subject: { type: "string", minLength: 1, maxLength: 150, pattern: "\\S" },
    description: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" },
    pageUrl: { type: ["string", "null"], maxLength: 500 },
  },
} as const;

export const replyBodySchema = {
  type: "object",
  required: ["body"],
  additionalProperties: false,
  properties: {
    body: { type: "string", minLength: 1, maxLength: 5000, pattern: "\\S" },
  },
} as const;

export const updateTicketBodySchema = {
  type: "object",
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: [...TICKET_STATUSES] },
    // Optional note sent to the reporter alongside the status change
    // ("Fixed — refresh the page and try again").
    message: { type: ["string", "null"], maxLength: 5000 },
  },
} as const;

export const inboxQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: [...TICKET_STATUSES] },
    kind: { type: "string", enum: [...TICKET_KINDS] },
  },
} as const;

export const ticketParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;
