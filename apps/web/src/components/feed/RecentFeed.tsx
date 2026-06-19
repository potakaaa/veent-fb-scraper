import { Badge } from "@workspace/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import type { Event } from "@/lib/types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SourceBadge({ source }: { source: string }) {
  if (source === "facebook") return <Badge variant="default">Facebook</Badge>;
  if (source === "x.com") return <Badge variant="secondary">X.com</Badge>;
  return <Badge variant="outline">{source || "unknown"}</Badge>;
}

export function RecentFeed({ events }: { events: Event[] }) {
  const recent = events.slice(0, 20);

  if (recent.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">No recent events.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {recent.map((event) => (
        <a
          key={event.id}
          href={event.event_url}
          target="_blank"
          rel="noreferrer"
          className="group block"
        >
          <Card className="h-full transition-shadow duration-200 group-hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <SourceBadge source={event.source} />
                <span className="text-muted-foreground text-xs">
                  {formatDate(event.start_datetime)}
                </span>
              </div>
              <CardTitle className="line-clamp-2 text-sm">
                {event.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 truncate">
                {(event.city_location || event.venue_name) && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                )}
                <span className="truncate">
                  {event.city_location || event.venue_name || "—"}
                </span>
              </CardDescription>
              {event.respondent_count > 0 && (
                <div className="flex justify-end pt-1">
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs tabular-nums">
                    {event.respondent_count.toLocaleString()} interested
                  </span>
                </div>
              )}
            </CardHeader>
          </Card>
        </a>
      ))}
    </div>
  );
}
