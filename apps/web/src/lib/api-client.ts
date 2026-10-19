import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const fetchWithSession = createIsomorphicFn()
  .server((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    const cookie = getRequestHeader("cookie");
    if (cookie) headers.set("cookie", cookie);
    return fetch(new Request(request, { headers }));
  })
  .client((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

export const apiClientOptions = {
  baseUrl: import.meta.env.VITE_API_URL,
  credentials: "include" as const,
  // Read cookies inside the request, never into shared config or query keys.
  fetch: fetchWithSession,
};

// Retrying won't sign the user in.
export const retryUnlessUnauthorized = (failureCount: number, error: { _tag: string }) =>
  error._tag !== "Unauthorized" && failureCount < 3;
