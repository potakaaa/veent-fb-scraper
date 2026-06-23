import { Cell, Label, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart";
import type { ChartConfig } from "@workspace/ui/components/chart";
import { groupBySource } from "@/lib/aggregate";
import type { Event } from "@/lib/types";

const SLICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

const chartConfig = {
  count: { label: "Events" },
} satisfies ChartConfig;

function label(source: string): string {
  if (source === "facebook") return "Facebook";
  if (source === "x.com") return "X.com";
  return source;
}

export function SourceSplit({ events }: { events: Event[] }) {
  const data = groupBySource(events).map((d) => ({
    ...d,
    name: label(d.source),
  }));

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col items-center gap-2">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[140px]"
      >
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            innerRadius={36}
            outerRadius={58}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.source}
                fill={SLICE_COLORS[index % SLICE_COLORS.length]}
              />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground font-bold"
                        fontSize={14}
                        fontWeight={700}
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 13}
                        fontSize={9}
                        className="fill-muted-foreground"
                      >
                        total
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4">
        {data.map((entry, index) => (
          <div key={entry.source} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
            />
            <span className="text-muted-foreground text-xs">
              {entry.name}{" "}
              <span className="text-foreground font-medium tabular-nums">
                {entry.count.toLocaleString()}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
