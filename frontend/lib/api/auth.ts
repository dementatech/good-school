import { apiFetch } from "./client";
import type { Role } from "../auth/roles";

export interface LoginResponse {
  role: Role;
  school_id: string;
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}
