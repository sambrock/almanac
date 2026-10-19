import { journalListOptions } from "@almanac/api-client/tanstack-query";
import { queryOptions } from "@tanstack/react-query";

import { apiClientOptions } from "../api-client";

export const journalEntriesQueryOptions = queryOptions({
  ...journalListOptions(apiClientOptions),
  // The list isn't live, so catch up on edits made on other devices.
  refetchOnWindowFocus: "always",
});
