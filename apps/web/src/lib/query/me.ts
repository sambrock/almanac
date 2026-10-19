import { usersMeOptions } from "@almanac/api-client/tanstack-query";
import { hashKey, type QueryClient, queryOptions } from "@tanstack/react-query";

import { apiClientOptions } from "../api-client";

export const meQueryOptions = queryOptions({
  ...usersMeOptions(apiClientOptions),
  retryOnMount: false,
});

export async function refreshSession(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => query.queryHash !== hashKey(meQueryOptions.queryKey),
  });
  await queryClient.invalidateQueries(meQueryOptions);
}
