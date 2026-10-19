import { environmentManager, QueryClient } from "@tanstack/react-query";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Data rendered on the server is still fresh when the page hydrates,
        // so the browser doesn't fetch it again straight away.
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // A retry on the server holds up the page. The browser retries instead.
          if (environmentManager.isServer()) return false;
          // Retrying won't sign the user in.
          const unauthorized =
            error instanceof Object && "_tag" in error && error._tag === "Unauthorized";
          return !unauthorized && failureCount < 3;
        },
      },
    },
  });
