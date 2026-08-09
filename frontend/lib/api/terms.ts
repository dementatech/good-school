import { apiFetch } from "./client";

export interface Term {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TermInput {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export async function listTerms(academicYearId?: string): Promise<Term[]> {
  const query = academicYearId ? `?academicYearId=${academicYearId}` : "";
  return apiFetch<Term[]>(`/academic/terms${query}`);
}

export async function createTerm(input: TermInput): Promise<Term> {
  return apiFetch("/academic/terms", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTerm(id: string, input: TermInput): Promise<Term> {
  return apiFetch<Term>(`/academic/terms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTerm(id: string): Promise<void> {
  await apiFetch<void>(`/academic/terms/${id}`, { method: "DELETE" });
}
