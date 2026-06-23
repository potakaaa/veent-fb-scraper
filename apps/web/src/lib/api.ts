import type { Event, EventsQueryParams, PatchEventBody } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:7842";

export async function fetchEvents(params?: EventsQueryParams): Promise<Event[]> {
  const url = new URL(`${BASE}/events`);
  if (params?.term) url.searchParams.set("term", params.term);
  if (params?.from) url.searchParams.set("from", params.from);
  if (params?.to) url.searchParams.set("to", params.to);
  if (params?.source) url.searchParams.set("source", params.source);
  url.searchParams.set("limit", String(params?.limit ?? 500));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET /events failed: ${res.status}`);
  return res.json();
}

export async function patchEvent(
  id: number,
  fields: PatchEventBody,
): Promise<{ updated: boolean }> {
  const res = await fetch(`${BASE}/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`PATCH /events/${id} failed: ${res.status}`);
  return res.json();
}

export async function deleteEvent(id: number): Promise<{ deleted: boolean }> {
  const res = await fetch(`${BASE}/events/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /events/${id} failed: ${res.status}`);
  return res.json();
}

export function exportCsvUrl(): string {
  return `${BASE}/export/csv`;
}
