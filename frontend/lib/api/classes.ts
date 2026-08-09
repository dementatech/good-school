import { apiFetch } from "./client";

export interface SchoolClass {
  id: string;
  academicYearId: string;
  academicLevelId: string;
  hasStreams: boolean;
  classTeacherId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolClassInput {
  academicYearId: string;
  academicLevelId: string;
  hasStreams?: boolean;
  classTeacherId?: string | null;
}

export async function listClasses(academicYearId?: string): Promise<SchoolClass[]> {
  const query = academicYearId ? `?academicYearId=${academicYearId}` : "";
  return apiFetch<SchoolClass[]>(`/academic/classes${query}`);
}

export async function createClass(input: SchoolClassInput): Promise<SchoolClass> {
  return apiFetch("/academic/classes", { method: "POST", body: JSON.stringify(input) });
}

export async function updateClass(id: string, input: SchoolClassInput): Promise<SchoolClass> {
  return apiFetch<SchoolClass>(`/academic/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteClass(id: string): Promise<void> {
  await apiFetch<void>(`/academic/classes/${id}`, { method: "DELETE" });
}
