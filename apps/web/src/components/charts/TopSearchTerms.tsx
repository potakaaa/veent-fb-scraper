import { topN } from "@/lib/aggregate";
import type { Event } from "@/lib/types";
import { HorizontalBarChart } from "./HorizontalBarChart";

export function TopSearchTerms({ events }: { events: Event[] }) {
  const data = topN(events, "source_search_term", 10);
  return <HorizontalBarChart data={data} color="var(--chart-3)" />;
}
