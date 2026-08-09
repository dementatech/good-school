import { apiFetch } from "./client";

export interface SchoolAdmin {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string;
}

export interface SchoolAdminInput {
  email: string;
  phoneNumber?: string | null;
}

export async function listSchoolAdmins(schoolId: string): Promise<SchoolAdmin[]> {
  return apiFetch<SchoolAdmin[]>(`/schools/${schoolId}/admins`);
}

export async function createSchoolAdmin(
  schoolId: string,
  input: SchoolAdminInput,
): Promise<{ admin: SchoolAdmin; tempPassword: string }> {
  return apiFetch(`/schools/${schoolId}/admins`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteSchoolAdmin(schoolId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/schools/${schoolId}/admins/${userId}`, { method: "DELETE" });
}
