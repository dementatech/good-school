import { apiFetch } from "./client";

export interface AcademicLevel {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  stage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicLevelInput {
  code: string;
  name: string;
  sortOrder?: number;
  stage?: string | null;
}

export async function listAcademicLevels(): Promise<AcademicLevel[]> {
  return apiFetch<AcademicLevel[]>("/academic/levels");
}

export async function createAcademicLevel(input: AcademicLevelInput): Promise<AcademicLevel> {
  return apiFetch("/academic/levels", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAcademicLevel(
  id: string,
  input: AcademicLevelInput,
): Promise<AcademicLevel> {
  return apiFetch<AcademicLevel>(`/academic/levels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAcademicLevel(id: string): Promise<void> {
  await apiFetch<void>(`/academic/levels/${id}`, { method: "DELETE" });
}
