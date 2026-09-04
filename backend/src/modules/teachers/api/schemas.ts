// Body validation for the teachers routes. Responses all use the shared
// { success, data } envelope (see src/shared/envelope.ts). Mirrors
// students/api/schemas.ts's structure.

const identityFields = {
  category: { type: "string", enum: ["administration", "teaching", "non_teaching", "support"] },
  firstName: { type: "string", minLength: 1 },
  middleName: { type: ["string", "null"] },
  lastName: { type: "string", minLength: 1 },
  dateOfBirth: { type: ["string", "null"] },
  gender: { type: ["string", "null"], enum: ["male", "female", null] },
  tmisNumber: { type: ["string", "null"] },
  tmisStatus: { type: "string", enum: ["registered", "pending", "not_registered"] },
  qualification: { type: ["string", "null"] },
  employmentType: { type: "string", enum: ["government", "private", "pta", "volunteer"] },
  employmentBasis: { type: ["string", "null"], enum: ["fulltime", "parttime", "practicing", null] },
  email: { type: ["string", "null"] },
  phoneNumber: { type: ["string", "null"] },
};

export const staffIdentityBodySchema = {
  type: "object",
  required: ["category", "firstName", "lastName", "employmentType"],
  properties: identityFields,
  additionalProperties: false,
} as const;

const assignmentSchema = {
  type: "object",
  required: ["academicYearId", "role", "entryDate", "entryType"],
  properties: {
    academicYearId: { type: "string" },
    role: {
      type: "string",
      enum: ["teacher", "head_teacher", "deputy", "bursar", "admin", "support"],
    },
    entryDate: { type: "string" },
    entryType: { type: "string", enum: ["new_hire", "transfer", "government_posting"] },
  },
  additionalProperties: false,
} as const;

export const createStaffBodySchema = {
  type: "object",
  required: ["category", "firstName", "lastName", "employmentType", "assignment"],
  properties: {
    ...identityFields,
    assignment: assignmentSchema,
    specializationSubjectIds: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;

export const assignmentBodySchema = assignmentSchema;

export const endAssignmentBodySchema = {
  type: "object",
  required: ["exitDate", "exitType"],
  properties: {
    exitDate: { type: "string" },
    exitType: {
      type: "string",
      enum: ["transfer", "resignation", "retirement", "government_reposting"],
    },
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

export const addSpecializationBodySchema = {
  type: "object",
  required: ["subjectId"],
  properties: {
    subjectId: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const createSubjectTeacherAssignmentBodySchema = {
  type: "object",
  required: ["subjectId", "academicYearId", "classId", "staffId", "startDate"],
  properties: {
    subjectId: { type: "string" },
    academicYearId: { type: "string" },
    classId: { type: "string" },
    streamId: { type: ["string", "null"] },
    staffId: { type: "string" },
    isLead: { type: "boolean" },
    startDate: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const endSubjectTeacherAssignmentBodySchema = {
  type: "object",
  required: ["endDate"],
  properties: {
    endDate: { type: "string" },
  },
  additionalProperties: false,
} as const;
