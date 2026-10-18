# Journal sync

Each entry is a Yjs document. Every client edits its own copy and swaps Yjs updates with the server over a WebSocket. Yjs merges concurrent edits, so two devices editing the same entry never overwrite each other, even if one was offline. [ADR 0001](adr/0001-yjs-for-journal-sync.md) records why we picked Yjs.

| Part          | Where                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor        | `apps/web/src/components/journal/JournalEditor.tsx`. CodeMirror bound to the entry's `body` Y.Text by y-codemirror.next, connected by y-websocket's `WebsocketProvider`. |
| Sync endpoint | `apps/server/src/features/journal/JournalSync.ts`                                                                                                                        |
| Storage       | `apps/server/src/features/journal/JournalEntries.ts`, table `journal_entry`                                                                                              |

## Protocol

The endpoint speaks the y-websocket wire protocol. Messages are lib0-encoded, type 0 for sync and type 1 for awareness. A native client must speak the same protocol.

1. The client opens `ws(s)://<api>/journal/sync/<YYYY-MM-DD>`. The web app authenticates with its session cookie. Native apps send `Authorization: Bearer <token>`.
2. The server sends sync step 1, its state vector. The client replies with whatever the server is missing, which is how offline edits reach it.
3. The client sends its own step 1 and the server replies with step 2.
4. From then on each local change goes up as an update. The server saves it, then relays it.

The server relays every message to every socket on the same entry, the sender included. Yjs ignores updates it already has. The echo has a job: y-websocket drops a connection that hears nothing for 30 seconds, and the client's own awareness ping coming back every 15 seconds keeps an idle connection open.

The server rejects a connection by closing it with a code in 4400-4499, which tells y-websocket to stop reconnecting.

| Code | Meaning                                                                                    |
| ---- | ------------------------------------------------------------------------------------------ |
| 4400 | The date isn't a real `YYYY-MM-DD` date                                                    |
| 4401 | No valid session                                                                           |
| 4403 | The `Origin` header isn't the web app's. Native apps send no `Origin` and skip this check. |

## Initial render

`GET /journal/entries/:date` reads an entry snapshot for the authenticated user. It returns the Markdown body and the full Yjs document state, encoded as base64, or `null` if the date has no entry. Reading a snapshot creates no row.

The web route loader forwards the incoming session cookie and awaits the generated snapshot query during server rendering. The router creates a QueryClient per request and hydrates its data into the browser. Saved Markdown appears in the initial HTML until CodeMirror takes over.

The editor applies the snapshot's Yjs update before creating CodeMirror or connecting the WebSocket. It preserves the document's existing Yjs identities, so live sync merges edits made after the snapshot without duplicating the prefetched text. Each route load refreshes the snapshot. Query refetches do not replace a mounted editor's live document.

## Storage

`journal_entry` holds one row per user per journal date. `doc` is the full Yjs state and the source of truth. `text` is a plain-text copy of the body that the server rewrites on every save, for code that reads entries without Yjs (list previews now, search and AI summaries later). Change an entry by changing its doc and let the server derive `text`.

App tables use autoincrement integer primary keys and integer foreign keys. Each row also has a unique NanoID `public_id`. The app API returns public IDs as `id`, including in entry summaries and `/me`. Better Auth uses its numeric IDs, represented as strings, within its own API and sessions. Journal sync still addresses an entry by the authenticated user and journal date. Saving changes keeps the entry's public ID.

The server keeps no documents in memory. For each sync message it takes a Postgres advisory lock on the entry, loads the doc, applies the message, and writes the row only if the doc changed. Opening a day without typing creates no row.

## Known limits

- Relaying uses an in-process PubSub. A second server instance would still save correctly, because of the advisory lock, but wouldn't relay to the first instance's sockets. Postgres `LISTEN/NOTIFY` would fix that.
- The browser stores nothing offline. Edits made while disconnected reach the server on reconnect only if the tab stays open. `y-indexeddb` would fix that.
- Every keystroke rewrites the entry's row. That's cheap at journal sizes.
- The entries list isn't live. The web client refetches it on window focus and a second after the open entry changes.

## Testing

Run the server's integration test with `TEST_DATABASE_URL` set to a local Postgres connection URL: `pnpm --filter @almanac/server test`. It creates and removes its own schema, and checks ID generation, authentication, journal persistence and cascading deletes.

Open the same day in two tabs and type in one. The client sets `disableBc: true`, so tabs sync through the server rather than through a BroadcastChannel, and a two-tab test covers the same path as phone to web.

When driving the editor with Playwright or CDP on macOS, Cmd+Z and Cmd+Shift+Z also trigger the browser's native undo and redo, on top of CodeMirror's. The text comes out mangled and looks like a sync bug. Dispatch a synthetic `keydown` on `.cm-content` instead. Real key presses behave correctly.
