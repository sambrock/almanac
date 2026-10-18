import { usersMeOptions } from "@almanac/api-client/tanstack-query";
import { hashKey, type QueryClient, queryOptions } from "@tanstack/react-query";

import { apiClientOptions, authClient, sessionToken } from "./api";

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

export async function signIn(email: string, otp: string) {
  const { error } = await authClient.signIn.emailOtp(
    { email, otp },
    {
      onSuccess: ({ response }) => {
        const token = response.headers.get("set-auth-token");
        if (token) sessionToken.set(token);
      },
    },
  );
  if (error) throw new Error(error.message ?? "Couldn't sign in");
}

export async function signOut(queryClient: QueryClient) {
  await authClient.signOut();
  await sessionToken.clear();
  await refreshSession(queryClient);
}
