import { apiFetch } from "./client";

export interface Stream {
  id: string;
  classId: string;
  name: string;
  streamTeacherId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreamInput {
  classId: string;
  name: string;
  streamTeacherId?: string | null;
}

export async function listStreams(classId?: string): Promise<Stream[]> {
  const query = classId ? `?classId=${classId}` : "";
  return apiFetch<Stream[]>(`/academic/streams${query}`);
}

export async function createStream(input: StreamInput): Promise<Stream> {
  return apiFetch("/academic/streams", { method: "POST", body: JSON.stringify(input) });
}

export async function updateStream(id: string, input: StreamInput): Promise<Stream> {
  return apiFetch<Stream>(`/academic/streams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteStream(id: string): Promise<void> {
  await apiFetch<void>(`/academic/streams/${id}`, { method: "DELETE" });
}
