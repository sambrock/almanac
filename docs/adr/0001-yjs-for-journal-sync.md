# Yjs for journal sync

Journal entries sync between devices with Yjs, relayed through our own server. We rejected Zero, Electric and a hand-rolled row sync. All three resolve concurrent edits to a text field with last-write-wins, which silently drops text when two devices edit the same entry, for example a phone that was offline while the web was in use. Yjs merges those edits. The relay lives in the existing Effect server, not a separate Hocuspocus process, so sync reuses the API's auth and the app stays one server.

## Consequences

- Entries are stored as Yjs state. Moving off Yjs means converting every stored entry.
- The native iOS and Android apps need Yjs too, through the y-crdt (yrs) Swift and Kotlin bindings, and each has to bind a native text view to a `Y.Text`.
- Habits, fitness and goals are structured records, which Yjs suits poorly. Their sync is undecided, and last-write-wins may be fine for them.
