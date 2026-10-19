import { journalGetOptions, journalListOptions } from "@almanac/api-client/tanstack-query";
import { queryOptions } from "@tanstack/react-query";

import { apiClientOptions, retryUnlessUnauthorized } from "./api-client";

export const journalEntriesQueryOptions = queryOptions({
  ...journalListOptions(apiClientOptions),
  staleTime: 30_000,
  // The list isn't live, so catch up on edits made on other devices.
  refetchOnWindowFocus: "always",
  retry: retryUnlessUnauthorized,
});

export const journalEntryQueryOptions = (date: string) =>
  queryOptions({
    ...journalGetOptions({ ...apiClientOptions, path: { date } }),
    // Route loaders refresh the snapshot before opening an editor. After that,
    // the mounted editor owns its document and receives updates through Yjs.
    staleTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

// y-websocket appends `/<date>` to this.
export const journalSyncUrl = `${import.meta.env.VITE_API_URL.replace(/^http/, "ws")}/journal/sync`;

// A journal date is a calendar day in the user's local time zone, as
// `YYYY-MM-DD`. Each date has at most one entry.

const pad = (n: number) => String(n).padStart(2, "0");

const toJournalDate = (day: Date) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;

const toLocalDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const today = () => toJournalDate(new Date());

export const isJournalDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && toJournalDate(toLocalDay(date)) === date;

export const addDays = (date: string, days: number) => {
  const day = toLocalDay(date);
  day.setDate(day.getDate() + days);
  return toJournalDate(day);
};

export const formatJournalDate = (date: string, style: "long" | "short") =>
  toLocalDay(date).toLocaleDateString(
    "en-GB",
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
