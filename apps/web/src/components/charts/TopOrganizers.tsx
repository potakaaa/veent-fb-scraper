import { topN } from "@/lib/aggregate";
import type { Event } from "@/lib/types";
import { HorizontalBarChart } from "./HorizontalBarChart";

export function TopOrganizers({ events }: { events: Event[] }) {
  const data = topN(events, "organizer_name", 10);
  return <HorizontalBarChart data={data} color="var(--chart-2)" />;
}
