import { useState, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { exportCsvUrl } from "@/lib/api";
import type { Event, PatchEventBody } from "@/lib/types";

const PAGE_SIZE = 50;

type SortKey =
  | "title"
  | "source"
  | "city_location"
  | "venue_name"
  | "organizer_name"
  | "start_datetime"
  | "respondent_count"
  | "collected_at"
  | "source_search_term";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
      {dir === "asc" || !active ? (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M4 1L7 6H1L4 1Z" />
        </svg>
      ) : (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M4 7L1 2H7L4 7Z" />
        </svg>
      )}
    </span>
  );
}

function sortEvents(events: Event[], key: SortKey, dir: SortDir): Event[] {
  return [...events].sort((a, b) => {
    let av = a[key] as string | number | null;
    let bv = b[key] as string | number | null;
    if (av === null || av === undefined) av = "";
    if (bv === null || bv === undefined) bv = "";
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

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

function NotesCell({
  event,
  onPatch,
}: {
  event: Event;
  onPatch: (id: number, fields: PatchEventBody) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(event.notes ?? "");

  if (editing) {
    return (
      <Input
        autoFocus
        className="w-44"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== (event.notes ?? "")) {
            onPatch(event.id, { notes: draft });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(event.notes ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground min-w-24 max-w-44 cursor-text truncate text-left"
      onClick={() => {
        setDraft(event.notes ?? "");
        setEditing(true);
      }}
    >
      {event.notes || "Add note…"}
    </button>
  );
}

export function EventsTable({
  events,
  isLoading,
  onPatch,
  onDelete,
}: {
  events: Event[];
  isLoading: boolean;
  onPatch: (id: number, fields: PatchEventBody) => void;
  onDelete: (id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("collected_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  const sortedEvents = useMemo(
    () => sortEvents(events, sortKey, sortDir),
    [events, sortKey, sortDir],
  );

  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sortedEvents.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {events.length.toLocaleString()} event{events.length === 1 ? "" : "s"}
        </span>
        <Button variant="default" size="sm" asChild>
          <a href={exportCsvUrl()} download>
            Export CSV
          </a>
        </Button>
      </div>

      <Table className="[&_td]:py-1 [&_td]:text-xs [&_th]:py-1.5 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider">
        <TableHeader>
          <TableRow>
            {(
              [
                { key: "title", label: "Title" },
                { key: "source", label: "Source" },
                { key: "city_location", label: "City" },
                { key: "venue_name", label: "Venue" },
                { key: "organizer_name", label: "Organizer" },
                { key: "start_datetime", label: "Date" },
                { key: "respondent_count", label: "Respondents", right: true },
                { key: "collected_at", label: "Collected" },
                { key: "source_search_term", label: "Search Term" },
              ] as Array<{ key: SortKey; label: string; right?: boolean }>
            ).map(({ key, label, right }) => (
              <TableHead
                key={key}
                className={`group cursor-pointer select-none whitespace-nowrap${right ? " text-right" : ""}`}
                onClick={() => handleSort(key)}
              >
                {label}
                <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : "asc"} />
              </TableHead>
            ))}
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Form</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {Array.from({ length: 14 }).map((__, j) => (
                  <TableCell key={`skeleton-cell-${j}`}>
                    <Skeleton className="h-3 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : pageRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={14} className="text-muted-foreground py-6 text-center text-xs">
                No events found
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((event, rowIndex) => (
              <TableRow key={event.id} className={rowIndex % 2 === 1 ? "bg-muted/20" : ""}>
                <TableCell className="max-w-52 overflow-hidden font-medium">
                  {/\/fbpost\/posts\/synth_/i.test(event.event_url) ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate" title="No direct permalink — post was collected from search results">
                        {event.title}
                      </span>
                      <a
                        href={`https://www.facebook.com/search/posts?q=${encodeURIComponent(event.title)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Search Facebook for this post"
                        className="text-muted-foreground hover:text-primary shrink-0"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      </a>
                    </span>
                  ) : (
                    <a
                      href={event.event_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline block truncate"
                    >
                      {event.title}
                    </a>
                  )}
                </TableCell>
                <TableCell>
                  <SourceBadge source={event.source} />
                </TableCell>
                <TableCell className="text-muted-foreground max-w-32 truncate">
                  {event.city_location || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-32 truncate">
                  {event.venue_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-32 truncate">
                  {event.organizer_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDate(event.start_datetime)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {event.respondent_count.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDate(event.collected_at)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-32 truncate">
                  {event.source_search_term || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-36 truncate">
                  {event.organizer_email ? (
                    <a href={`mailto:${event.organizer_email}`} className="hover:underline" title={event.organizer_email}>
                      {event.organizer_email}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {event.organizer_phone ? (
                    <a href={`tel:${event.organizer_phone}`} className="hover:underline">
                      {event.organizer_phone}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <NotesCell event={event} onPatch={onPatch} />
                </TableCell>
                <TableCell>
                  {event.google_form_url ? (
                    <a
                      href={event.google_form_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline whitespace-nowrap"
                    >
                      Form ↗
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-6 w-6"
                    aria-label="Delete event"
                    onClick={() => {
                      if (typeof window !== "undefined" && window.confirm("Delete this event?")) {
                        onDelete(event.id);
                      }
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground text-xs">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
