// The response envelope the ported TERECO frontend expects everywhere
// (`{ success: true, data }` / `{ success: false, error }`). Used by the
// academic-structure routes; other modules can adopt it as they're reworked.

export function ok<T>(data: T) {
  return { success: true as const, data };
}

export function fail(error: string) {
  return { success: false as const, error };
}

export const envelopeSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: {},
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;
