import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

const url = process.env.EXPO_PUBLIC_API_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_API_URL to the server's URL");
export const apiUrl = url;

// The app signs in with a session token instead of a cookie. The server reads
// it from `Authorization: Bearer <token>`.
const sessionTokenKey = "session-token";

export const sessionToken = {
  get: () => SecureStore.getItem(sessionTokenKey),
  set: (token: string) => SecureStore.setItem(sessionTokenKey, token),
  clear: () => SecureStore.deleteItemAsync(sessionTokenKey),
};

export const bearerHeader = (): Record<string, string> => {
  const token = sessionToken.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiClientOptions = {
  baseUrl: apiUrl,
  // Without this, iOS stores the session cookie from sign-in and sends it on
  // later requests. Better Auth rejects cookie requests that have no Origin.
  credentials: "omit" as const,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    for (const [name, value] of Object.entries(bearerHeader())) request.headers.set(name, value);
    return fetch(request);
  },
};

export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [emailOTPClient()],
  fetchOptions: {
    credentials: "omit",
    auth: { type: "Bearer", token: () => sessionToken.get() ?? undefined },
  },
});
