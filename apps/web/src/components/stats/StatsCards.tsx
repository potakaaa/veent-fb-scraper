import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  StarIcon,
  CheckmarkCircle01Icon,
  Analytics01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import type { Event } from "@/lib/types";

export function StatsCards({ events }: { events: Event[] }) {
  const totalEvents = events.length;
  const facebookCount = events.filter((e) => e.source === "facebook").length;
  const xCount = events.filter((e) => e.source === "x.com").length;
  const enrichedCount = events.filter((e) => e.enriched_at !== null).length;
  const highInterestCount = events.filter(
    (e) => e.respondent_count > 100,
  ).length;

  const enrichedPct = totalEvents > 0 ? enrichedCount / totalEvents : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* Total Events */}
      <Card className="relative overflow-hidden border-l-4 border-l-[var(--chart-1)]">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardDescription>Total Events</CardDescription>
            <HugeiconsIcon
              icon={Calendar01Icon}
              size={18}
              className="text-muted-foreground mt-0.5 shrink-0"
              strokeWidth={1.5}
            />
          </div>
          <CardTitle className="text-2xl tabular-nums">
            {totalEvents.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* By Source */}
      <Card className="relative overflow-hidden border-l-4 border-l-[var(--chart-2)]">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardDescription>By Source</CardDescription>
            <HugeiconsIcon
              icon={Analytics01Icon}
              size={18}
              className="text-muted-foreground mt-0.5 shrink-0"
              strokeWidth={1.5}
            />
          </div>
          <CardTitle className="text-2xl tabular-nums">
            {facebookCount.toLocaleString()}
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              Facebook
            </span>
          </CardTitle>
          <CardDescription className="text-foreground">
            {xCount.toLocaleString()} X.com
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Enriched Events */}
      <Card className="relative overflow-hidden border-l-4 border-l-[var(--chart-3)]">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardDescription>Enriched Events</CardDescription>
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              size={18}
              className="text-muted-foreground mt-0.5 shrink-0"
              strokeWidth={1.5}
            />
          </div>
          <CardTitle className="text-2xl tabular-nums">
            {enrichedCount.toLocaleString()}
          </CardTitle>
          <CardDescription>
            of {totalEvents.toLocaleString()} total
          </CardDescription>
          {/* Progress bar */}
          <div className="bg-muted mt-2 h-1 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[var(--chart-1)] transition-all"
              style={{ width: `${Math.round(enrichedPct * 100)}%` }}
            />
          </div>
        </CardHeader>
      </Card>

      {/* High Interest */}
      <Card className="relative overflow-hidden border-l-4 border-l-primary">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardDescription>High Interest (&gt;100)</CardDescription>
            <HugeiconsIcon
              icon={StarIcon}
              size={18}
              className="text-primary mt-0.5 shrink-0"
              strokeWidth={1.5}
            />
          </div>
          <CardTitle className="text-primary text-2xl tabular-nums">
            {highInterestCount.toLocaleString()}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
