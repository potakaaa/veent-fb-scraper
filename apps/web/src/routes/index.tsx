import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { useEvents, usePatchEvent, useDeleteEvent } from "@/hooks/useEvents";
import { StatsCards } from "@/components/stats/StatsCards";
import { EventsTableFilters } from "@/components/table/EventsTableFilters";
import { EventsTable } from "@/components/table/EventsTable";
import { EventsOverTime } from "@/components/charts/EventsOverTime";
import { SourceSplit } from "@/components/charts/SourceSplit";
import { TopCities } from "@/components/charts/TopCities";
import { TopOrganizers } from "@/components/charts/TopOrganizers";
import { TopSearchTerms } from "@/components/charts/TopSearchTerms";
import { RespondentDistribution } from "@/components/charts/RespondentDistribution";
import { RecentFeed } from "@/components/feed/RecentFeed";
import { useTheme } from "@/lib/theme";
import type { EventFilters } from "@/lib/types";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

const DEFAULT_FILTERS: EventFilters = {
  source: "",
  term: "",
  from: "",
  to: "",
};

function DashboardPage() {
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<"all" | "upcoming">("all");
  const { theme, toggleTheme } = useTheme();

  const { data: allEvents = [], isLoading } = useEvents({ limit: 500 });
  const { data: filteredEvents = [] } = useEvents({
    source: filters.source || undefined,
    term: filters.term || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    limit: 500,
  });

  const tableEvents = useMemo(() => {
    if (viewMode !== "upcoming") return filteredEvents;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredEvents.filter((e) => {
      if (!e.start_datetime) return false;
      const d = new Date(e.start_datetime);
      return !Number.isNaN(d.getTime()) && d >= today;
    });
  }, [filteredEvents, viewMode]);

  const { mutate: patch } = usePatchEvent();
  const { mutate: del } = useDeleteEvent();

  const lastUpdated = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav bar */}
      <nav className="bg-foreground text-background sticky top-0 z-50 border-b border-border">
        <div className="container mx-auto flex h-10 items-center justify-between px-4">
          <span className="font-heading text-sm font-semibold tracking-wide">
            Veent / Events Dashboard
          </span>
          <div className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
              Live
            </span>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="text-background/70 hover:text-background rounded p-1 transition-colors"
            >
              {theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Header strip */}
      <header className="bg-card border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-4 py-2">
          <div className="flex items-baseline gap-2">
            <h1 className="font-heading text-base font-bold tracking-tight">
              FB Events Dashboard
            </h1>
            <span className="text-muted-foreground text-xs">
              Events from Facebook &amp; X.com
            </span>
          </div>
          <span className="text-muted-foreground text-[10px]">
            Updated {lastUpdated}
          </span>
        </div>
      </header>

      <main className="container mx-auto space-y-3 px-4 py-3">
        {/* Stats strip */}
        <StatsCards events={allEvents} />

        {/* Row 1: Events Over Time + Source Split */}
        <div className="grid grid-cols-5 gap-3">
          <Card className="col-span-3">
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Events Over Time</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <EventsOverTime events={allEvents} />
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source Split</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <SourceSplit events={allEvents} />
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Top Cities + Top Organizers + Top Search Terms */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Cities</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <TopCities events={allEvents} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Organizers</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <TopOrganizers events={allEvents} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Search Terms</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <TopSearchTerms events={allEvents} />
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Respondent Distribution + Recent Feed */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <Card>
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Respondent Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <RespondentDistribution events={allEvents} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-3 pb-1 pt-2.5">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recently Collected</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
              <RecentFeed events={allEvents} />
            </CardContent>
          </Card>
        </div>

        {/* Events table */}
        <Card>
          <CardHeader className="px-3 pb-1 pt-2.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`rounded px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    viewMode === "all"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Events
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("upcoming")}
                  className={`rounded px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    viewMode === "upcoming"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Upcoming
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <EventsTableFilters filters={filters} onFiltersChange={setFilters} />
            <div className="mt-2">
              <EventsTable
                events={tableEvents}
                isLoading={isLoading}
                onPatch={(id, fields) => patch({ id, fields })}
                onDelete={(id) => del(id)}
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
