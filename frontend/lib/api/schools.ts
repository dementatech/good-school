import { apiFetch } from "./client";

export interface School {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
}

export async function listSchools(): Promise<School[]> {
  return apiFetch<School[]>("/schools");
}

export async function createSchool(name: string): Promise<School> {
  return apiFetch<School>("/schools", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
