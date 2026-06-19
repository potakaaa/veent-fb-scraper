import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart";
import type { ChartConfig } from "@workspace/ui/components/chart";
import { respondentBuckets } from "@/lib/aggregate";
import type { Event } from "@/lib/types";

const chartConfig = {
  count: { label: "Events", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function RespondentDistribution({ events }: { events: Event[] }) {
  const data = respondentBuckets(events);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={0} />
      </BarChart>
    </ChartContainer>
  );
}
