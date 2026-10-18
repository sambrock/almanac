# Almanac

Almanac is a personal app for recording your life. The journal is the first feature. AI summaries, habit tracking, fitness tracking and goal tracking come later. `apps/server` is the Effect API, `apps/web` is the TanStack Start web app, and `apps/ios` and `apps/android` will be native Swift and Kotlin apps.

## Domain

- Use the terms in `GLOSSARY.md` for names in code, docs and UI copy. Add a term there once its meaning is settled.
- A journal has at most one entry per journal date. The client decides the journal date from the user's local calendar and sends it as `YYYY-MM-DD`. The server never works out "today".
- An entry's body is Markdown, stored as plain text inside a Yjs document.
- Entries sync live between devices. Read `docs/journal-sync.md` before changing the editor, the sync endpoint or the `journal_entry` table.
- Decisions that were deliberate trade-offs live in `docs/adr/`. Check there before proposing an alternative.
