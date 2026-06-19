export interface Event {
  id: number;
  event_url: string;
  event_url_normalized: string;
  title: string;
  start_datetime: string | null;
  end_datetime: string | null;
  venue_name: string | null;
  city_location: string | null;
  organizer_name: string | null;
  short_description: string | null;
  source_search_term: string;
  collected_at: string;
  exported_at: string | null;
  respondent_count: number;
  notes: string | null;
  enriched_at: string | null;
  source: string;
}

export interface EventsQueryParams {
  term?: string;
  from?: string;
  to?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export type PatchEventBody = Partial<
  Pick<Event, "notes" | "organizer_name" | "city_location" | "venue_name">
>;

export interface EventFilters {
  source: string;
  term: string;
  from: string;
  to: string;
}
