import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, patchEvent, deleteEvent } from "@/lib/api";
import type { EventsQueryParams, PatchEventBody } from "@/lib/types";

export function useEvents(params?: EventsQueryParams) {
  return useQuery({
    queryKey: ["events", params],
    queryFn: () => fetchEvents(params),
  });
}

export function usePatchEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: PatchEventBody }) =>
      patchEvent(id, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
