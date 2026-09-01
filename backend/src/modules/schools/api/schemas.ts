const nullableStr = { type: ["string", "null"] } as const;

const schoolProps = {
  name: { type: "string", minLength: 1 },
  legalName: nullableStr,
  slug: nullableStr,
  emisCode: nullableStr,
  unebCentreNumber: nullableStr,
  ownershipType: {
    type: ["string", "null"],
    enum: ["government", "private", "community", "religious", "international", null],
  },
  registrationStatus: {
    type: ["string", "null"],
    enum: ["registered", "licensed", "provisional", "unregistered", null],
  },
  district: nullableStr,
  subCounty: nullableStr,
  address: nullableStr,
  gpsLat: { type: ["number", "null"] },
  gpsLng: { type: ["number", "null"] },
  headTeacherName: nullableStr,
  headTeacherContact: nullableStr,
  phone: nullableStr,
  email: nullableStr,
  website: nullableStr,
  schoolType: { type: ["string", "null"], enum: ["day", "boarding", "mixed", null] },
  genderComposition: { type: ["string", "null"], enum: ["boys", "girls", "mixed", null] },
  offersOLevel: { type: "boolean" },
  offersALevel: { type: "boolean" },
  dataImportSource: { type: ["string", "null"], enum: ["fresh", "migrated", null] },
} as const;

export const createSchoolBodySchema = {
  type: "object",
  required: ["name"],
  properties: schoolProps,
  additionalProperties: false,
} as const;

export const updateSchoolBodySchema = {
  type: "object",
  properties: schoolProps,
  additionalProperties: false,
  minProperties: 1,
} as const;

export const statusBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["pending_verification", "active", "suspended", "churned"] },
  },
  additionalProperties: false,
} as const;

export const attachCurriculumBodySchema = {
  type: "object",
  required: ["curriculumId"],
  properties: {
    curriculumId: { type: "string" },
    isPrimary: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

export const createSchoolAdminBodySchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", minLength: 1 },
    phoneNumber: nullableStr,
  },
  additionalProperties: false,
} as const;

export const themeResponseSchema = {
  200: {
    type: "object",
    properties: {
      primaryColor: { type: "string" },
      accentColor: { type: "string" },
      radius: { type: "string" },
      fontFamily: { type: "string" },
      logoUrl: { type: ["string", "null"] },
    },
  },
  404: { type: "object", properties: { error: { type: "string" } } },
} as const;
