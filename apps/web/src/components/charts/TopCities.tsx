import { topN } from "@/lib/aggregate";
import type { Event } from "@/lib/types";
import { HorizontalBarChart } from "./HorizontalBarChart";

export function TopCities({ events }: { events: Event[] }) {
  const data = topN(events, "city_location", 10);
  return <HorizontalBarChart data={data} color="var(--chart-1)" />;
}
