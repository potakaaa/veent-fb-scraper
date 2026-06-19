import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart";
import type { ChartConfig } from "@workspace/ui/components/chart";
import { groupByDate } from "@/lib/aggregate";
import type { Event } from "@/lib/types";

const chartConfig = {
  count: { label: "Events", color: "var(--chart-1)" },
} satisfies ChartConfig;

function shortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EventsOverTime({ events }: { events: Event[] }) {
  const data = groupByDate(events);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={shortDate}
          minTickGap={16}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(label) => shortDate(String(label))} />}
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
