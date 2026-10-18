# Yjs for journal sync

Journal entries sync between devices with Yjs, relayed through our own server. We rejected Zero, Electric and a hand-rolled row sync. All three resolve concurrent edits to a text field with last-write-wins, which silently drops text when two devices edit the same entry, for example a phone that was offline while the web was in use. Yjs merges those edits. The relay lives in the existing Effect server, not a separate Hocuspocus process, so sync reuses the API's auth and the app stays one server.

## Consequences

- Entries are stored as Yjs state. Moving off Yjs means converting every stored entry.
- The Expo app needs Yjs too. It can use the same `yjs` and `y-websocket` packages as the web app. CodeMirror doesn't run in React Native, so how the mobile editor binds to a `Y.Text` is still open.
- Habits, fitness and goals are structured records, which Yjs suits poorly. Their sync is undecided, and last-write-wins may be fine for them.
