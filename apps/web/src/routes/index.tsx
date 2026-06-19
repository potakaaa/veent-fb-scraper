import { useState } from "react";
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

  const { data: allEvents = [], isLoading } = useEvents({ limit: 500 });
  const { data: filteredEvents = [] } = useEvents({
    source: filters.source || undefined,
    term: filters.term || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    limit: 500,
  });

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
      <nav className="bg-foreground text-background sticky top-0 z-50 border-b border-white/10">
        <div className="container mx-auto flex h-12 items-center justify-between px-6">
          <span className="font-heading text-sm font-semibold tracking-wide">
            Veent / Events Dashboard
          </span>
          <span className="bg-background/10 rounded-full px-3 py-0.5 text-xs font-medium">
            Live
          </span>
        </div>
      </nav>

      {/* Hero header band */}
      <header className="bg-foreground text-background border-b border-white/10">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight">
                FB Events Dashboard
              </h1>
              <p className="text-background/60 mt-1 text-sm">
                Events collected from Facebook and X.com
              </p>
            </div>
            <span className="bg-background/10 self-start rounded-full px-3 py-1 text-xs font-medium sm:self-auto">
              Updated {lastUpdated}
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-10 px-6 py-8">
        {/* Stats */}
        <StatsCards events={allEvents} />

        {/* Analytics section */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-semibold">Analytics</h2>
            <div className="bg-border h-px flex-1" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Events Over Time</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <EventsOverTime events={allEvents} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Source Split</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <SourceSplit events={allEvents} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Top Cities</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <TopCities events={allEvents} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Top Organizers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <TopOrganizers events={allEvents} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Top Search Terms</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <TopSearchTerms events={allEvents} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Respondent Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RespondentDistribution events={allEvents} />
            </CardContent>
          </Card>
        </section>

        {/* Recently Collected */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-semibold">Recently Collected</h2>
            <div className="bg-border h-px flex-1" />
          </div>
          <div className="bg-muted/30 rounded-xl p-6">
            <RecentFeed events={allEvents} />
          </div>
        </section>

        {/* All Events table */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-semibold">All Events</h2>
            <div className="bg-border h-px flex-1" />
          </div>
          <div className="bg-muted/30 rounded-xl p-6">
            <EventsTableFilters filters={filters} onFiltersChange={setFilters} />
            <div className="mt-4">
              <EventsTable
                events={filteredEvents}
                isLoading={isLoading}
                onPatch={(id, fields) => patch({ id, fields })}
                onDelete={(id) => del(id)}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
