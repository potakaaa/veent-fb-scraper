import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart";
import type { ChartConfig } from "@workspace/ui/components/chart";

const chartConfig = {
  count: { label: "Events", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function HorizontalBarChart({
  data,
  color = "var(--chart-1)",
}: {
  data: { label: string; count: number }[];
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[300px] items-center justify-center text-xs">
        No data
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 36 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={120}
          tickFormatter={(value: string) =>
            value.length > 18 ? `${value.slice(0, 17)}…` : value
          }
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="count"
            position="right"
            className="fill-muted-foreground text-xs tabular-nums"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
