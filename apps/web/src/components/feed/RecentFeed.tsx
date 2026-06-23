import type { Event } from "@/lib/types";

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    // raw string — grab only the first date-like token (e.g. "Jun 13")
    const match = value.match(/[A-Z][a-z]{2}\s+\d{1,2}/);
    return match ? match[0] : value.slice(0, 10);
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SourceDot({ source }: { source: string }) {
  const color =
    source === "facebook"
      ? "bg-[var(--chart-1)]"
      : source === "x.com"
        ? "bg-[var(--chart-2)]"
        : "bg-muted-foreground";
  return <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

export function RecentFeed({ events }: { events: Event[] }) {
  const recent = events.slice(0, 8);

  if (recent.length === 0) {
    return <p className="text-muted-foreground text-xs">No recent events.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-3">
      {recent.map((event) => (
        <a
          key={event.id}
          href={event.event_url}
          target="_blank"
          rel="noreferrer"
          className="hover:bg-muted/40 flex items-start gap-1.5 rounded px-1 py-1 transition-colors"
        >
          <SourceDot source={event.source} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium leading-tight">
              {event.title}
            </span>
            <span className="text-muted-foreground flex items-center gap-1 text-[10px] leading-tight">
              <span className="truncate">{event.city_location || event.venue_name || "—"}</span>
              {formatDate(event.start_datetime) && (
                <span className="shrink-0 opacity-60">{formatDate(event.start_datetime)}</span>
              )}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
