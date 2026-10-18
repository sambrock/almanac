import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { cn } from "cn";

import { JournalEditor } from "#/components/journal/JournalEditor";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
import {
  addDays,
  formatJournalDate,
  isJournalDate,
  journalEntriesQueryOptions,
  today,
} from "#/lib/journal";
import { meQueryOptions } from "#/lib/me";

export const Route = createFileRoute("/journal/$date")({ component: JournalPage });

function JournalPage() {
  const { date } = Route.useParams();
  const me = useQuery(meQueryOptions);

  if (me.isPending) {
    return <p className="text-muted-foreground p-6 text-sm">Loading…</p>;
  }
  if (me.isError) {
    return (
      <p className="text-destructive p-6 text-sm">{me.error.message}. Is the server running?</p>
    );
  }
  if (me.data === null) return <Navigate to="/" replace />;
  if (!isJournalDate(date)) {
    return <Navigate to="/journal/$date" params={{ date: today() }} replace />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl gap-10 px-6 py-8">
      <aside className="hidden w-60 shrink-0 md:block">
        <EntryList activeDate={date} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6">
        <Header date={date} email={me.data.email} />
        <h1 className="text-2xl font-semibold tracking-tight">{formatJournalDate(date, "long")}</h1>
        <JournalEditor key={date} date={date} />
      </main>
    </div>
  );
}

function Header({ date, email }: { date: string; email: string }) {
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => queryClient.invalidateQueries(meQueryOptions),
  });

  return (
    <header className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={<Link to="/journal/$date" params={{ date: addDays(date, -1) }} />}
        aria-label="Previous day"
      >
        <RiArrowLeftSLine />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={<Link to="/journal/$date" params={{ date: addDays(date, 1) }} />}
        aria-label="Next day"
      >
        <RiArrowRightSLine />
      </Button>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<Link to="/journal/$date" params={{ date: today() }} />}
      >
        Today
      </Button>
      <span className="text-muted-foreground ml-auto truncate text-sm">{email}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        Sign out
      </Button>
    </header>
  );
}

function EntryList({ activeDate }: { activeDate: string }) {
  const entries = useQuery(journalEntriesQueryOptions);

  return (
    <nav className="flex flex-col gap-1" aria-label="Journal entries">
      <h2 className="text-muted-foreground mb-2 px-3 text-xs font-medium">Entries</h2>
      {entries.isError && <p className="text-destructive px-3 text-sm">{entries.error.message}</p>}
      {entries.data?.length === 0 && (
        <p className="text-muted-foreground px-3 text-sm">Nothing written yet.</p>
      )}
      {entries.data?.map((entry) => (
        <Link
          key={entry.date}
          to="/journal/$date"
          params={{ date: entry.date }}
          className={cn(
            "hover:bg-accent rounded-md px-3 py-2",
            entry.date === activeDate && "bg-accent",
          )}
        >
          <span className="block text-sm font-medium">
            {formatJournalDate(entry.date, "short")}
          </span>
          <span className="text-muted-foreground line-clamp-2 text-xs">{entry.preview}</span>
        </Link>
      ))}
    </nav>
  );
}
