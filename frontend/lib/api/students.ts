import { apiFetch } from "./client";

export interface Student {
  userId: string;
  systemId: string | null;
  fullName: string;
  dateOfBirth: string | null;
  className: string | null;
  email: string | null;
  phoneNumber: string | null;
  enrolledAt: string;
  isActive: boolean;
}

export interface StudentInput {
  fullName: string;
  dateOfBirth?: string | null;
  className?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

export async function listStudents(): Promise<Student[]> {
  return apiFetch<Student[]>("/students");
}

export async function createStudent(
  input: StudentInput,
): Promise<{ student: Student; tempPassword: string }> {
  return apiFetch("/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStudent(userId: string, input: StudentInput): Promise<Student> {
  return apiFetch<Student>(`/students/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteStudent(userId: string): Promise<void> {
  await apiFetch<void>(`/students/${userId}`, { method: "DELETE" });
}

export async function archiveStudent(userId: string): Promise<Student> {
  return apiFetch<Student>(`/students/${userId}/archive`, { method: "POST" });
}

export async function restoreStudent(userId: string): Promise<Student> {
  return apiFetch<Student>(`/students/${userId}/restore`, { method: "POST" });
}

export async function resetStudentPasswords(userIds: string[]): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>("/students/reset-passwords", {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}
