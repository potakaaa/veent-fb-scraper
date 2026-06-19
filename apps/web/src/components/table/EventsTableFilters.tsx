import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { EventFilters } from "@/lib/types";

const ALL = "all";

export function EventsTableFilters({
  filters,
  onFiltersChange,
}: {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">Source</label>
            <Select
              value={filters.source === "" ? ALL : filters.source}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  source: value === ALL ? "" : value,
                })
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="x.com">X.com</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">Search term</label>
            <Input
              className="w-56"
              placeholder="Filter by search term…"
              value={filters.term}
              onChange={(e) =>
                onFiltersChange({ ...filters, term: e.target.value })
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">From</label>
            <Input
              className="w-40"
              type="date"
              value={filters.from}
              onChange={(e) =>
                onFiltersChange({ ...filters, from: e.target.value })
              }
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs font-medium">To</label>
            <Input
              className="w-40"
              type="date"
              value={filters.to}
              onChange={(e) => onFiltersChange({ ...filters, to: e.target.value })}
            />
          </div>

          <Button
            variant="outline"
            onClick={() =>
              onFiltersChange({ source: "", term: "", from: "", to: "" })
            }
          >
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
