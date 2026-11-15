// tasks-kanban — contract shared by server.ts and app.tsx.
//
// Everything in this module must stay browser-safe: it is bundled into the
// frontend app as well as the server bundle. No server-only imports here
// (notably, no `@get-bb/plugin-sdk` root) — types and plain values only.

// Realtime channel app.tsx listens on; the server publishes on it after
// every write so every open board refetches, no matter which surface made
// the change.
export const BOARD_CHANGED_CHANNEL = "tasks-kanban-changed";
