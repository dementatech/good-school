// Body validation for the organization routes (departments + the position
// tree). Responses all use the shared { success, data } envelope.

export const addNonAcademicDepartmentBodySchema = {
  type: "object",
  required: ["catalogId"],
  properties: {
    catalogId: { type: "string" },
    reportsToPositionId: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

export const addCustomDepartmentBodySchema = {
  type: "object",
  required: ["name", "departmentType"],
  properties: {
    name: { type: "string", minLength: 1 },
    departmentType: { type: "string", enum: ["academic", "non_academic"] },
    reportsToPositionId: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const positionFields = {
  title: { type: "string", minLength: 1 },
  category: { type: "string", enum: ["executive", "department_head", "teacher", "non_teaching"] },
  parentPositionId: { type: ["string", "null"] },
  departmentId: { type: ["string", "null"] },
  isUnique: { type: "boolean" },
};

export const createPositionBodySchema = {
  type: "object",
  required: ["title", "category"],
  properties: positionFields,
  additionalProperties: false,
} as const;

export const updatePositionBodySchema = {
  type: "object",
  properties: positionFields,
  additionalProperties: false,
  minProperties: 1,
} as const;

export const assignStaffPositionBodySchema = {
  type: "object",
  required: ["staffId", "academicYearId", "startDate"],
  properties: {
    staffId: { type: "string" },
    academicYearId: { type: "string" },
    startDate: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const endStaffPositionBodySchema = {
  type: "object",
  required: ["endDate"],
  properties: {
    endDate: { type: "string" },
  },
  additionalProperties: false,
} as const;
