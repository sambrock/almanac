import type { JournalGetResponse } from "@almanac/api-client";
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";

import { journalSyncUrl } from "@/lib/api-client";
import { BODY, createJournalDocument } from "@/lib/journal-document";
import { journalEntriesQueryOptions } from "@/lib/query/journal";
import { meQueryOptions } from "@/lib/query/me";

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
export function JournalEditor({
  date,
  initialSnapshot,
}: {
  date: string;
  initialSnapshot: JournalGetResponse;
}) {
  const queryClient = useQueryClient();
  const parent = useRef<HTMLDivElement>(null);
  // Later query refreshes must not replace a live document or its pending edits.
  const [snapshot] = useState(initialSnapshot);
  const hydrated = useHydrated();

  useLayoutEffect(() => {
    const doc = createJournalDocument(snapshot);
    const body = doc.getText(BODY);
    // disableBc: sync tabs through the server, the same way other devices do.
    const provider = new WebsocketProvider(journalSyncUrl, date, doc, { disableBc: true });
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
      doc: body.toString(),
      extensions: [
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
        markdown(),
        syntaxHighlighting(markdownStyle),
        EditorView.lineWrapping,
        placeholder("What happened today?"),
        theme,
        // No awareness: remote cursors aren't useful with a single author.
        yCollab(body, null),
      ],
    });
    view.focus();

    return () => {
      clearTimeout(refreshList);
      view.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [date, queryClient, snapshot]);

  return (
    <div>
      {!hydrated && snapshot?.body && (
        <div className="min-h-[60vh] whitespace-pre-wrap text-[1.0625rem] leading-[1.75]">
          {snapshot.body}
        </div>
      )}
      <div ref={parent} />
    </div>
  );
}
