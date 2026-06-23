import type { Event } from "./types";

export function groupByDate(events: Event[]): { date: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (!e.start_datetime) continue;
    const d = new Date(e.start_datetime);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 7);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, count]) => ({ date, count }));
}

export function groupBySource(
  events: Event[],
): { source: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const src = e.source || "unknown";
    counts[src] = (counts[src] ?? 0) + 1;
  }
  return Object.entries(counts).map(([source, count]) => ({ source, count }));
}

export function topN(
  events: Event[],
  field: keyof Event,
  n = 10,
): { label: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const val = e[field];
    if (!val) continue;
    const key = String(val);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

export function respondentBuckets(
  events: Event[],
): { bucket: string; count: number }[] {
  const buckets = [
    { bucket: "0–9", min: 0, max: 9 },
    { bucket: "10–49", min: 10, max: 49 },
    { bucket: "50–99", min: 50, max: 99 },
    { bucket: "100–499", min: 100, max: 499 },
    { bucket: "500+", min: 500, max: Infinity },
  ];
  return buckets.map(({ bucket, min, max }) => ({
    bucket,
    count: events.filter(
      (e) => e.respondent_count >= min && e.respondent_count <= max,
    ).length,
  }));
}
