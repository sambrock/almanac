import { queryOptions } from "@tanstack/react-query";

export type Me = { id: string; email: string; name: string; emailVerified: boolean };

// Resolves to null when signed out.
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/me`, {
      credentials: "include",
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`GET /me failed with ${response.status}`);
    return response.json();
  },
});
