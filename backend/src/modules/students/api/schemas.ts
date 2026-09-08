// Body validation for the students routes. Responses all use the shared
// { success, data } envelope (see src/shared/envelope.ts).

const guardianLinkFields = {
  role: { type: "string", enum: ["parent", "sponsor", "guardian"] },
  isPrimaryContact: { type: "boolean" },
  isFeeResponsible: { type: "boolean" },
  isEmergencyContact: { type: "boolean" },
};

// One of guardianId (attach existing) or newGuardian (match-or-create) is
// required — enforced server-side in the route handler, not in JSON Schema,
// since JSON Schema's oneOf error messages are unhelpful for this shape.
const guardianRowSchema = {
  type: "object",
  required: ["role", "isPrimaryContact", "isFeeResponsible", "isEmergencyContact"],
  properties: {
    guardianId: { type: "string" },
    newGuardian: {
      type: "object",
      required: ["firstName", "lastName"],
      properties: {
        firstName: { type: "string", minLength: 1 },
        lastName: { type: "string", minLength: 1 },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        nin: { type: ["string", "null"] },
        relationshipToStudent: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    ...guardianLinkFields,
  },
  additionalProperties: false,
} as const;

const identityFields = {
  firstName: { type: "string", minLength: 1 },
  middleName: { type: ["string", "null"] },
  lastName: { type: "string", minLength: 1 },
  dateOfBirth: { type: ["string", "null"] },
  gender: { type: ["string", "null"], enum: ["male", "female", null] },
  lin: { type: ["string", "null"] },
  linStatus: { type: "string", enum: ["verified", "pending", "not_yet_issued"] },
  email: { type: ["string", "null"] },
  phoneNumber: { type: ["string", "null"] },
};

export const studentIdentityBodySchema = {
  type: "object",
  required: ["firstName", "lastName"],
  properties: identityFields,
  additionalProperties: false,
} as const;

// Class-aware admission extras — the wizard sends whichever apply to the
// chosen entry class. Reused as the standalone POST /:id/prior-exams body too.
const priorExamFields = {
  examType: { type: "string", enum: ["PLE", "UCE"] },
  examYear: { type: "integer", minimum: 1980, maximum: 2100 },
  candidateNumber: { type: ["string", "null"] },
  aggregate: { type: ["integer", "null"] },
  divisionOrResult: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  subjects: {
    type: "array",
    items: {
      type: "object",
      required: ["principalSubjectId", "grade"],
      properties: {
        principalSubjectId: { type: "string" },
        grade: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
};

export const priorExamBodySchema = {
  type: "object",
  required: ["examType", "examYear"],
  properties: priorExamFields,
  additionalProperties: false,
} as const;

const admissionCombinationProps = {
  schoolCombinationId: { type: "string" },
  subsidiarySubjectId: { type: ["string", "null"] },
  overrideReason: { type: ["string", "null"] },
};

export const createStudentBodySchema = {
  type: "object",
  required: ["firstName", "lastName", "enrollment", "guardians"],
  properties: {
    ...identityFields,
    enrollment: {
      type: "object",
      required: ["academicYearId", "classId", "entryDate", "entryType"],
      properties: {
        academicYearId: { type: "string" },
        classId: { type: "string" },
        streamId: { type: ["string", "null"] },
        entryDate: { type: "string" },
        entryType: {
          type: "string",
          enum: ["new_admission", "transfer", "repeat", "re_admission_s5"],
        },
      },
      additionalProperties: false,
    },
    guardians: { type: "array", items: guardianRowSchema, minItems: 1 },
    priorExam: {
      type: ["object", "null"],
      required: ["examType", "examYear"],
      properties: priorExamFields,
      additionalProperties: false,
    },
    oLevelSubjectIds: { type: ["array", "null"], items: { type: "string" } },
    combination: {
      type: ["object", "null"],
      required: ["schoolCombinationId"],
      properties: admissionCombinationProps,
      additionalProperties: false,
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

export const enrollmentBodySchema = {
  type: "object",
  required: ["academicYearId", "classId", "entryDate", "entryType"],
  properties: {
    academicYearId: { type: "string" },
    classId: { type: "string" },
    streamId: { type: ["string", "null"] },
    entryDate: { type: "string" },
    entryType: {
      type: "string",
      enum: ["new_admission", "transfer", "repeat", "re_admission_s5"],
    },
  },
  additionalProperties: false,
} as const;

export const withdrawBodySchema = {
  type: "object",
  required: ["exitDate", "exitType"],
  properties: {
    exitDate: { type: "string" },
    exitType: { type: "string", enum: ["transfer", "withdrawal", "completion", "no_show"] },
  },
  additionalProperties: false,
} as const;

export const guardianLinkBodySchema = {
  type: "object",
  required: ["role", "isPrimaryContact", "isFeeResponsible", "isEmergencyContact"],
  properties: {
    guardianId: { type: "string" },
    newGuardian: guardianRowSchema.properties.newGuardian,
    ...guardianLinkFields,
  },
  additionalProperties: false,
} as const;

export const addStudentSubjectBodySchema = {
  type: "object",
  required: ["subjectId", "academicYearId"],
  properties: {
    subjectId: { type: "string" },
    academicYearId: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const dropStudentSubjectBodySchema = {
  type: "object",
  required: ["academicYearId"],
  properties: {
    academicYearId: { type: "string" },
    reason: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

export const selectCombinationBodySchema = {
  type: "object",
  required: ["academicYearId", "schoolCombinationId"],
  properties: {
    academicYearId: { type: "string" },
    schoolCombinationId: { type: "string" },
    subsidiarySubjectId: { type: ["string", "null"] },
    overrideReason: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;
