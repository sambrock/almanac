import type { JournalGetResponse } from "@almanac/api-client";
import { defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { journalSyncUrl } from "@/lib/api-client";
import { BODY, FOLLOW_UPS, createJournalDocument } from "@/lib/journal-document";
import { journalEntriesQueryOptions } from "@/lib/query/journal";
import { meQueryOptions } from "@/lib/query/me";
import { formatJournalDate } from "@/lib/utils/date";

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
  ".cm-content": { padding: "0" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

const textExtensions = [
  markdown(),
  syntaxHighlighting(markdownStyle),
  EditorView.lineWrapping,
  theme,
];

// Edits the entry for `date`. Remount it (with `key`) to switch dates.
export function JournalEditor({
  date,
  initialSnapshot,
}: {
  date: string;
  initialSnapshot: JournalGetResponse;
}) {
  const queryClient = useQueryClient();
  // Later query refreshes must not replace a live document or its pending edits.
  const [snapshot] = useState(initialSnapshot);
  const [doc, setDoc] = useState<Y.Doc>();

  useLayoutEffect(() => {
    const doc = createJournalDocument(snapshot);
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
    setDoc(doc);

    return () => {
      clearTimeout(refreshList);
      provider.destroy();
      doc.destroy();
    };
  }, [date, queryClient, snapshot]);

  // The server render has no document, so it shows the saved text instead.
  if (!doc) {
    return (
      <div className="min-h-[60vh] whitespace-pre-wrap text-[1.0625rem] leading-[1.75]">
        {snapshot?.body}
      </div>
    );
  }
  return <EntryParts key={doc.guid} doc={doc} />;
}

// The entry's parts as plain values. Locked text is copied out as strings;
// `current` is the one Y.Text the user can still edit: the body if there are
// no follow-ups, otherwise the answer to the latest one.
function readEntry(doc: Y.Doc) {
  const body = doc.getText(BODY);
  const followUps = doc
    .getArray<Y.Map<string | Y.Text | Array<string>>>(FOLLOW_UPS)
    .map((followUp) => {
      const references = followUp.get("references");
      return {
        response: followUp.get("response")?.toString() ?? "",
        question: followUp.get("question")?.toString() ?? "",
        answer: followUp.get("answer"),
        references: Array.isArray(references) ? references : [],
      };
    });
  const lastAnswer = followUps.at(-1)?.answer;
  return {
    body: body.toString(),
    followUps: followUps.map(({ answer, ...followUp }) => ({
      ...followUp,
      answer: answer?.toString() ?? "",
    })),
    current: lastAnswer instanceof Y.Text ? lastAnswer : body,
  };
}

function EntryParts({ doc }: { doc: Y.Doc }) {
  // Copied into state, rather than read from the doc while rendering, so
  // React sees each change: a follow-up arriving, or another device's edit.
  const [entry, setEntry] = useState(() => readEntry(doc));
  useEffect(() => {
    const update = () => setEntry(readEntry(doc));
    doc.on("update", update);
    return () => doc.off("update", update);
  }, [doc]);

  const { body, followUps, current } = entry;
  return (
    <div>
      {followUps.length > 0 && <LockedText text={body} />}
      {followUps.map((followUp, index) => (
        <Fragment key={index}>
          <div className="text-follow-up text-[1.0625rem] leading-[1.75]">
            <p>{followUp.response}</p>
            <p>{followUp.question}</p>
            {followUp.references.length > 0 && (
              <p className="flex flex-wrap gap-x-3 text-sm">
                {followUp.references.map((date) => (
                  <Link
                    key={date}
                    to="/journal/$date"
                    params={{ date }}
                    className="underline underline-offset-4"
                  >
                    {formatJournalDate(date, "short")}
                  </Link>
                ))}
              </p>
            )}
          </div>
          {index < followUps.length - 1 && <LockedText text={followUp.answer} />}
        </Fragment>
      ))}
      <LiveText
        key={followUps.length}
        text={current}
        hint={followUps.length === 0 ? "What happened today?" : "Write your answer…"}
      />
    </div>
  );
}

function LiveText({ text, hint }: { text: Y.Text; hint: string }) {
  const parent = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: parent.current!,
      doc: text.toString(),
      extensions: [
        keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
        textExtensions,
        EditorView.theme({ ".cm-content": { minHeight: "60vh" } }),
        placeholder(hint),
        // No awareness: remote cursors aren't useful with a single author.
        yCollab(text, null),
      ],
    });
    view.focus();
    // A new answer starts below the fold once the entry is long.
    view.dom.scrollIntoView({ block: "nearest" });
    return () => view.destroy();
  }, [text, hint]);

  return <div ref={parent} />;
}

// Text the user can no longer edit, styled the same as the editor.
function LockedText({ text }: { text: string }) {
  const parent = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: parent.current!,
      doc: text,
      extensions: [textExtensions, EditorView.editable.of(false)],
    });
    return () => view.destroy();
  }, [text]);

  return <div ref={parent} />;
}
