import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ClientOnly,
  Link,
  Navigate,
  createFileRoute,
  redirect,
  useHydrated,
} from "@tanstack/react-router";
import { cn } from "cn";

import { JournalEditor } from "@/components/journal/JournalEditor";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  addDays,
  formatJournalDate,
  isJournalDate,
  journalEntriesQueryOptions,
  journalEntryQueryOptions,
  today,
} from "@/lib/journal";
import { meQueryOptions, refreshSession } from "@/lib/me";
import { prefetchJournal } from "@/lib/prefetch-journal";

export const Route = createFileRoute("/journal/$date")({
  loader: async ({ context, params }) => {
    await prefetchJournal(
      context.queryClient,
      isJournalDate(params.date) ? params.date : undefined,
    );
    const session = context.queryClient.getQueryState(meQueryOptions.queryKey);
    if (session?.error?._tag === "Unauthorized") {
      throw redirect({ to: "/" });
    }
  },
  component: JournalPage,
});

function JournalPage() {
  const { date } = Route.useParams();
  const me = useQuery(meQueryOptions);

  if (me.isPending) {
    return <p className="text-muted-foreground p-6 text-sm">Loading…</p>;
  }
  if (me.isError) {
    if (me.error._tag === "Unauthorized") return <Navigate to="/" replace />;
    return (
      <p className="text-destructive p-6 text-sm">
        {me.error.message ?? "Couldn't load your account"}. Is the server running?
      </p>
    );
  }
  if (!isJournalDate(date)) {
    return (
      <ClientOnly>
        <GoToToday />
      </ClientOnly>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl gap-10 px-6 py-8">
      <aside className="hidden w-60 shrink-0 md:block">
        <EntryList activeDate={date} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6">
        <Header date={date} email={me.data.email} />
        <h1 className="text-2xl font-semibold tracking-tight">{formatJournalDate(date, "long")}</h1>
        <EntryEditor key={date} date={date} />
      </main>
    </div>
  );
}

function GoToToday() {
  return <Navigate to="/journal/$date" params={{ date: today() }} replace />;
}

function EntryEditor({ date }: { date: string }) {
  const { data } = useSuspenseQuery(journalEntryQueryOptions(date));
  return <JournalEditor date={date} initialEntry={data} />;
}

function Header({ date, email }: { date: string; email: string }) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Couldn't sign out");
    },
    onSuccess: () => refreshSession(queryClient),
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
        disabled={!hydrated}
        render={<Link to="/journal/$date" params={{ date: hydrated ? today() : date }} />}
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
      {entries.isError && (
        <p className="text-destructive px-3 text-sm">
          {entries.error.message ?? "Couldn't load journal entries"}
        </p>
      )}
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
