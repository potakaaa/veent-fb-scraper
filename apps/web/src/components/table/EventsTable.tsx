import { useState } from "react";
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

  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = events.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {events.length.toLocaleString()} event
          {events.length === 1 ? "" : "s"}
        </span>
        <Button variant="default" asChild>
          <a href={exportCsvUrl()} download>
            Export CSV
          </a>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>Organizer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Respondents</TableHead>
            <TableHead>Collected</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {Array.from({ length: 10 }).map((__, j) => (
                  <TableCell key={`skeleton-cell-${j}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : pageRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={10}
                className="text-muted-foreground py-8 text-center"
              >
                No events found
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((event, rowIndex) => (
              <TableRow key={event.id} className={rowIndex % 2 === 1 ? "bg-muted/30" : ""}>
                <TableCell className="max-w-64 truncate font-medium">
                  <a
                    href={event.event_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {event.title}
                  </a>
                </TableCell>
                <TableCell>
                  <SourceBadge source={event.source} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {event.city_location || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-40 truncate">
                  {event.venue_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-40 truncate">
                  {event.organizer_name || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(event.start_datetime)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {event.respondent_count.toLocaleString()}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(event.collected_at)}
                </TableCell>
                <TableCell>
                  <NotesCell event={event} onPatch={onPatch} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    aria-label="Delete event"
                    onClick={() => {
                      if (
                        typeof window !== "undefined" &&
                        window.confirm("Delete this event?")
                      ) {
                        onDelete(event.id);
                      }
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.5} />
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
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
