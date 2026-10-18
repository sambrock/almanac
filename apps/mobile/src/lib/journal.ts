import { apiUrl, bearerHeader } from "./api";

// A journal date is a calendar day in the user's local time zone, as
// `YYYY-MM-DD`. Each date has at most one entry.

// y-websocket appends `/<date>` to this.
export const journalSyncUrl = `${apiUrl.replace(/^http/, "ws")}/journal/sync`;

// y-websocket opens sockets with `new WebSocket(url, protocols)`. React
// Native's WebSocket takes headers as a third argument, which is how the
// session token reaches the sync endpoint.
export class JournalSyncSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    // @ts-expect-error The DOM lib's WebSocket type hides React Native's third argument.
    super(url, protocols, { headers: bearerHeader() });
  }
}

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

export const formatJournalDate = (date: string) =>
  toLocalDay(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
