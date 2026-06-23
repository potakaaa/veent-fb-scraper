import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  StarIcon,
  CheckmarkCircle01Icon,
  Analytics01Icon,
} from "@hugeicons/core-free-icons";
import type { Event } from "@/lib/types";

interface StatCellProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  iconNode: React.ReactNode;
}

function StatCell({ label, value, sub, accent, iconNode }: StatCellProps) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-2.5"
      style={accent ? { borderTop: `2px solid ${accent}` } : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-widest">
          {label}
        </span>
        {iconNode}
      </div>
      <span className="text-foreground text-xl font-bold tabular-nums leading-none">
        {value}
      </span>
      {sub && (
        <span className="text-muted-foreground text-[11px] leading-none">{sub}</span>
      )}
    </div>
  );
}

export function StatsCards({ events }: { events: Event[] }) {
  const totalEvents = events.length;
  const facebookCount = events.filter((e) => e.source === "facebook").length;
  const xCount = events.filter((e) => e.source === "x.com").length;
  const enrichedCount = events.filter((e) => e.enriched_at !== null).length;
  const highInterestCount = events.filter((e) => e.respondent_count > 100).length;
  const enrichedPct = totalEvents > 0 ? Math.round((enrichedCount / totalEvents) * 100) : 0;

  return (
    <div className="bg-card border-border grid grid-cols-4 divide-x divide-[var(--border)] overflow-hidden rounded-lg border">
      <StatCell
        label="Total Events"
        value={totalEvents.toLocaleString()}
        iconNode={<HugeiconsIcon icon={Calendar01Icon} size={12} className="text-muted-foreground" strokeWidth={1.5} />}
        accent="var(--chart-1)"
      />
      <StatCell
        label="By Source"
        value={
          <>
            {facebookCount.toLocaleString()}
            <span className="text-muted-foreground ml-1 text-xs font-normal">FB</span>
            <span className="mx-1.5 text-muted-foreground/40">/</span>
            {xCount.toLocaleString()}
            <span className="text-muted-foreground ml-1 text-xs font-normal">X</span>
          </>
        }
        iconNode={<HugeiconsIcon icon={Analytics01Icon} size={12} className="text-muted-foreground" strokeWidth={1.5} />}
        accent="var(--chart-2)"
      />
      <StatCell
        label="Enriched"
        value={enrichedCount.toLocaleString()}
        sub={
          <span className="flex items-center gap-1">
            <span className="inline-block h-1 w-12 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${enrichedPct}%` }} />
            </span>
            {enrichedPct}% of {totalEvents.toLocaleString()}
          </span>
        }
        iconNode={<HugeiconsIcon icon={CheckmarkCircle01Icon} size={12} className="text-muted-foreground" strokeWidth={1.5} />}
        accent="var(--chart-3)"
      />
      <StatCell
        label="High Interest >100"
        value={<span className="text-primary">{highInterestCount.toLocaleString()}</span>}
        iconNode={<HugeiconsIcon icon={StarIcon} size={12} className="text-primary" strokeWidth={1.5} />}
        accent="var(--primary)"
      />
    </div>
  );
}
