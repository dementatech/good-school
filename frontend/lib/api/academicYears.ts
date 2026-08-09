import { apiFetch } from "./client";

export interface AcademicYear {
  id: string;
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicYearInput {
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  return apiFetch<AcademicYear[]>("/academic/years");
}

export async function createAcademicYear(input: AcademicYearInput): Promise<AcademicYear> {
  return apiFetch("/academic/years", { method: "POST", body: JSON.stringify(input) });
}

export async function updateAcademicYear(
  id: string,
  input: AcademicYearInput,
): Promise<AcademicYear> {
  return apiFetch<AcademicYear>(`/academic/years/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAcademicYear(id: string): Promise<void> {
  await apiFetch<void>(`/academic/years/${id}`, { method: "DELETE" });
}
