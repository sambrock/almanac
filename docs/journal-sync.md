# Journal sync

Each entry is a Yjs document. Every client edits its own copy and swaps Yjs updates with the server over a WebSocket. Yjs merges concurrent edits, so two devices editing the same entry never overwrite each other, even if one was offline. [ADR 0001](adr/0001-yjs-for-journal-sync.md) records why we picked Yjs.

| Part          | Where                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor        | `apps/web/src/components/journal/journal-editor.tsx`. CodeMirror bound to the entry's `body` Y.Text by y-codemirror.next, connected by y-websocket's `WebsocketProvider`. |
| Sync endpoint | `apps/server/src/features/journal/JournalSync.ts`, relaying through `JournalRelay.ts`                                                                                     |
| Follow-ups    | `apps/server/src/features/journal/JournalEntryReflections.ts`. The editor renders them in `journal-editor.tsx`.                                                           |
| Summaries     | `apps/server/src/features/journal/JournalEntrySummaries.ts`                                                                                                               |
| Storage       | `apps/server/src/features/journal/JournalEntries.ts`, table `journal_entry`                                                                                               |

## Protocol

The endpoint speaks the y-websocket wire protocol. Messages are lib0-encoded, type 0 for sync and type 1 for awareness. A native client must speak the same protocol.

1. The client opens `ws(s)://<api>/journal/sync/<YYYY-MM-DD>`. The web app authenticates with its session cookie. The mobile app sends `Authorization: Bearer <token>`.
2. The server sends sync step 1, its state vector. The client replies with whatever the server is missing, which is how offline edits reach it.
3. The client sends its own step 1 and the server replies with step 2.
4. From then on each local change goes up as an update. The server saves it, then relays it.

The server relays every message to every socket on the same entry, the sender included. Yjs ignores updates it already has. The echo has a job: y-websocket drops a connection that hears nothing for 30 seconds, and the client's own awareness ping coming back every 15 seconds keeps an idle connection open.

The server rejects a connection by closing it with a code in 4400-4499, which tells y-websocket to stop reconnecting.

| Code | Meaning                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4400 | The date isn't a real `YYYY-MM-DD` date                                                                                                                                                     |
| 4401 | No valid session                                                                                                                                                                            |
| 4403 | The `Origin` header isn't the web app's. Sockets that send `Authorization` skip this check, because browsers can't set that header on a WebSocket. React Native sends the API's own origin. |

## Follow-ups

The doc holds two shared types. `body` is a Y.Text with what the user wrote before pressing Go deeper. `followUps` is a Y.Array of Y.Maps, one per follow-up, each with the AI's `response` and `question` as strings, the user's `answer` as a Y.Text, and `references`, an array of the journal dates of earlier entries the follow-up mentions. Follow-ups written before references existed don't have the key. Only the server adds follow-ups, so the user's texts never contain words the AI wrote. The `text` column joins the body and the non-empty answers with blank lines.

Once an entry has a follow-up, everything before the last answer is locked. The web editor binds CodeMirror to one Y.Text at a time: `body` while there are no follow-ups, then the latest `answer`. Earlier texts render as read-only CodeMirror views with the same styling, and follow-ups render in blue, with the response and question on separate lines. The lock is only in the web editor. The server doesn't enforce it, and the mobile app still edits `body`.

Pressing Go deeper calls `POST /journal/entries/:date/follow-ups`. The server reads the body and answers as user messages and the follow-ups as assistant messages, and sends them to Claude Opus. It refuses an entry with no text, and an entry whose latest answer is empty. It appends the new follow-up with an empty `answer`, then publishes the update through `JournalRelay`, so every open editor shows it at once. The web editor then moves to the new answer and focuses it.

Follow-ups can bring up what the user wrote before. The prompt carries the title and summary of every earlier entry, oldest first, as a cached system block. Only entries dated before this one count, so going deeper on an old entry doesn't see what came after it. The model has two tools. `read_entry` returns an earlier entry's full transcript, so the model quotes what the user wrote rather than the summary. `write_follow_up` takes the follow-up. Claude Opus 5.5 rejects forced tool choice, and `effect/ai`'s `generateObject` fails on any step where the model calls a tool, so the follow-up comes through a tool rather than structured output. The server calls the model in a loop, at most six times, until it calls `write_follow_up`. It keeps only `references` that name earlier entries the model was shown, and the editor links each one.

## Initial render

`GET /journal/entries/:date` reads an entry snapshot for the authenticated user. It returns the Markdown body and the full Yjs document state, encoded as base64, or `null` if the date has no entry. Reading a snapshot creates no row.

The web route loader forwards the incoming session cookie and awaits the generated snapshot query during server rendering. The router creates a QueryClient per request and hydrates its data into the browser. Saved Markdown appears in the initial HTML until CodeMirror takes over.

The editor applies the snapshot's Yjs update before creating CodeMirror or connecting the WebSocket. It preserves the document's existing Yjs identities, so live sync merges edits made after the snapshot without duplicating the prefetched text. Each route load refreshes the snapshot. Query refetches do not replace a mounted editor's live document.

## Storage

`journal_entry` holds one row per user per journal date. `doc` is the full Yjs state and the source of truth. `text` is a plain-text copy of the body that the server rewrites on every save, for code that reads entries without Yjs (list previews and the md5 that marks a summary current now, search later). Change an entry by changing its doc and let the server derive `text`.

`title` holds the entry title and `summary` the entry summary's bullet points, as `text[]`. One call to Claude Sonnet writes both from the entry's transcript: the body, then each follow-up in `<follow_up>` tags followed by its answer. Pressing Done on the web calls `POST /journal/entries/:date/summary`, which summarises the entry straight away and reports a failure to the user. The web app then refetches the entry snapshot, which shows the summary below the entry unless the entry is under 280 characters. For entries nobody pressed Done on, `JournalEntrySummaries.ts` runs once a minute and picks up entries that have gone five minutes without an edit and whose `text` no longer matches `summarised_text_md5`. It stores the title, the summary and the md5 of the text it read. If the call still fails after two retries, it stores the md5 anyway. That entry waits for its next edit instead of costing a request every minute. The snapshot returns `summary` only while that md5 matches, so the web app never shows a summary of older text. Both are columns, not part of the Yjs doc, because only the server writes them. The server needs `ANTHROPIC_API_KEY` to start.

App tables use autoincrement integer primary keys and integer foreign keys. Each row also has a unique `public_id`: 21 lowercase letters and digits, made by `makePublicId` in `apps/server/src/domain/ids.ts`. The app API returns public IDs as `id`, including in entry summaries and `/me`. Better Auth uses its numeric IDs, represented as strings, within its own API and sessions. Journal sync still addresses an entry by the authenticated user and journal date. Saving changes keeps the entry's public ID.

The server keeps no documents in memory. For each sync message it takes a Postgres advisory lock on the entry, loads the doc, applies the message, and writes the row only if the doc changed. Opening a day without typing creates no row.

## Known limits

- Relaying uses an in-process PubSub. A second server instance would still save correctly, because of the advisory lock, but wouldn't relay to the first instance's sockets. Postgres `LISTEN/NOTIFY` would fix that.
- The browser stores nothing offline. Edits made while disconnected reach the server on reconnect only if the tab stays open. `y-indexeddb` would fix that.
- Every keystroke rewrites the entry's row. That's cheap at journal sizes.
- An entry whose summary request failed keeps its old title and summary, or none, until it's edited again. That includes a bad API key. Its old summary is hidden but still reaches follow-ups.
- A summary on screen stays there while the user keeps writing. It goes when the page reloads, and comes back after the next Done.
- Every earlier entry's summary goes into each follow-up's prompt. A year of daily entries is about 70,000 tokens. Years of entries would need search instead.
- The mobile app doesn't show follow-ups or answers yet. It only edits `body`, even after the web editor has locked it.
- The entries list isn't live. The web client refetches it on window focus and a second after the open entry changes.

## Testing

Run the server's integration test with `TEST_DATABASE_URL` set to a local Postgres connection URL: `pnpm --filter @almanac/server test`. It creates and removes its own schema, and checks ID generation, authentication, journal persistence and cascading deletes.

Open the same day in two tabs and type in one. The client sets `disableBc: true`, so tabs sync through the server rather than through a BroadcastChannel, and a two-tab test covers the same path as phone to web.

When driving the editor with Playwright or CDP on macOS, Cmd+Z and Cmd+Shift+Z also trigger the browser's native undo and redo, on top of CodeMirror's. The text comes out mangled and looks like a sync bug. Dispatch a synthetic `keydown` on `.cm-content` instead. Real key presses behave correctly.
