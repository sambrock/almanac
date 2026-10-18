import { usersMeOptions } from "@almanac/api-client/tanstack-query";
import { hashKey, type QueryClient, queryOptions } from "@tanstack/react-query";

import { apiClientOptions } from "./api-client";

export const meQueryOptions = queryOptions({
  ...usersMeOptions(apiClientOptions),
  staleTime: 30_000,
  retryOnMount: false,
  retry: (failureCount, error) => error._tag !== "Unauthorized" && failureCount < 3,
});

export async function refreshSession(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => query.queryHash !== hashKey(meQueryOptions.queryKey),
  });
  await queryClient.invalidateQueries(meQueryOptions);
}
