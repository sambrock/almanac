import { queryOptions } from "@tanstack/react-query";

// A journal date is a calendar day in the user's local time zone, as
// `YYYY-MM-DD`. Each date has at most one entry.

export type JournalEntrySummary = { date: string; preview: string };

export const journalEntriesQueryOptions = queryOptions({
  queryKey: ["journal", "entries"],
  queryFn: async (): Promise<Array<JournalEntrySummary>> => {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/journal/entries`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(`GET /journal/entries failed with ${response.status}`);
    return response.json();
  },
});

// y-websocket appends `/<date>` to this.
export const journalSyncUrl = `${import.meta.env.VITE_API_URL.replace(/^http/, "ws")}/journal/sync`;

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
    undefined,
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
