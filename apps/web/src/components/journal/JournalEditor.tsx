import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { journalEntriesQueryOptions, journalSyncUrl } from "#/lib/journal";
import { meQueryOptions } from "#/lib/me";

type SyncStatus = "connecting" | "synced" | "offline";

const statusLabel: Record<SyncStatus, string> = {
  connecting: "Connecting…",
  synced: "Synced",
  offline: "Offline. Changes sync when you reconnect.",
};

const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "700" },
  { tag: tags.heading3, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "ui-monospace, monospace" },
  { tag: tags.quote, color: "var(--muted-foreground)" },
  // Markdown syntax characters such as `#`, `**` and `>`.
  { tag: tags.processingInstruction, color: "var(--muted-foreground)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "1.0625rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.75" },
  ".cm-content": { padding: "0", minHeight: "60vh" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

// Edits the entry for `date`. Remount it (with `key`) to switch dates.
export function JournalEditor({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const parent = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");

  useEffect(() => {
    const doc = new Y.Doc();
    // disableBc: sync tabs through the server, the same way other devices do.
    const provider = new WebsocketProvider(journalSyncUrl, date, doc, { disableBc: true });
    const updateStatus = () =>
      setStatus(provider.synced ? "synced" : provider.wsconnected ? "connecting" : "offline");
    provider.on("status", updateStatus);
    provider.on("sync", updateStatus);
    // The server closed the socket for good, most likely because the session ended.
    provider.on("closed", () => queryClient.invalidateQueries(meQueryOptions));

    // Keep the sidebar previews current while this entry changes, here or elsewhere.
    let refreshList: ReturnType<typeof setTimeout> | undefined;
    doc.on("update", () => {
      clearTimeout(refreshList);
      refreshList = setTimeout(
        () => queryClient.invalidateQueries(journalEntriesQueryOptions),
        1000,
      );
    });

    const view = new EditorView({
      parent: parent.current!,
      extensions: [
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
        markdown(),
        syntaxHighlighting(markdownStyle),
        EditorView.lineWrapping,
        placeholder("What happened today?"),
        theme,
        // No awareness: remote cursors aren't useful with a single author.
        yCollab(doc.getText("body"), null),
      ],
    });
    view.focus();

    return () => {
      clearTimeout(refreshList);
      view.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [date, queryClient]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {statusLabel[status]}
      </p>
      <div ref={parent} />
    </div>
  );
}
