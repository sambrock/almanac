import type { QueryClient } from "@tanstack/react-query";

import { journalEntriesQueryOptions, journalEntryQueryOptions } from "./journal";
import { meQueryOptions } from "./me";

export async function prefetchJournal(queryClient: QueryClient, date?: string) {
  await queryClient.prefetchQuery(meQueryOptions);
  if (queryClient.getQueryState(meQueryOptions.queryKey)?.status !== "success") return;

  await Promise.all([
    queryClient.prefetchQuery(journalEntriesQueryOptions),
    date ? queryClient.fetchQuery(journalEntryQueryOptions(date)) : undefined,
  ]);
}
