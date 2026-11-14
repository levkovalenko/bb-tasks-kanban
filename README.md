# Tasks Kanban for BB

[![CI](https://github.com/levkovalenko/bb-tasks-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/levkovalenko/bb-tasks-kanban/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![bb plugin](https://img.shields.io/badge/bb-plugin-0.2.2-brightgreen)](./package.json)

**Русская версия: [README.ru.md](./README.ru.md)**

BB ships a full task tracker (projects, statuses, priorities, due dates,
labels, comments, `@`-mentions in chat) — but no way to see it as a board.
**Tasks Kanban** adds the missing surface: a live Kanban for the built-in
**BB Tasks**, right in your BB sidebar.

- **Every card, every column.** All six statuses — Backlog, To Do, In
  Progress, In Review, Done, Canceled — rendered as lanes.
- **Real moves, not a copy.** Drag & drop calls the Tasks plugin's own
  `boardMove`. The card you move is the same row that `bb tasks`, the
  sidebar, and your agents see — and vice versa: a status changed from the
  CLI or by an agent appears on the board automatically (realtime).
- **Full task editing.** Open a card to edit title, description, status,
  priority, due date, and labels; read and write the task's comment history.
- **Create and delete.** New tasks are created straight into the selected
  tracker project; delete with confirmation.
- **Any tracker project.** Switch between all of your BB Tasks projects from
  the board's toolbar. The project linked to the current BB project is
  preselected.
- **Bilingual.** The interface follows your BB language: English and
  Russian.
- **Agent-friendly.** Ships a `board` skill: your agent can work the board
  through `bb tasks` and the board refreshes by itself.

## Install

Requires **BB 0.49+** with the built-in Tasks plugin (bundled by default).

From the marketplace:

```sh
bb marketplace add git:https://github.com/levkovalenko/bb-tasks-kanban.git@main
bb plugin install tasks-kanban@levkovalenko-plugins
```

Or directly from Git:

```sh
bb plugin install git:https://github.com/levkovalenko/bb-tasks-kanban.git@v0.2.2
```

Then open the **Task board** panel (SectionMove icon) in the left sidebar — it is
available project-wide, from any thread.

## How it works

The plugin stores nothing. Its server proxies every read and write into the
built-in `tasks` plugin's RPC surface via `bb.sdk.plugins.callRpc`, so there
is exactly one source of truth: the Tasks database. After each write the
plugin publishes a realtime channel (`tasks-kanban-changed`) and every open
board refetches — no refresh button required, though one exists.

```
app.tsx (Kanban UI)
  └─> board_* RPC (this plugin, server.ts, zod-validated)
        └─> bb.sdk.plugins.callRpc({ pluginId: "tasks", … })
              └─> built-in tasks plugin — same DB as `bb tasks`
```

## Settings

On the plugin's settings page (Tools → Tasks Kanban):

- **Board language** — `auto` (follow the browser), `en`, or `ru`.
- **Card sort order** — `manual` (drag & drop order), `due` (due date,
  default), or `priority`.
- **Description on cards** — two-line description preview on each card.
- **Lane toggles** — show or hide any of the six columns (e.g. hide
  Canceled for a five-column board).

Changes apply to the open board immediately, no reload needed.

> **Language note.** The board content always follows the Board language
> setting. Two things are fixed independently of it:
>
> - **Settings-page labels** — computed once, from the OS language of the
>   bb server process (in Node, `navigator.language` is the OS locale).
>   Reloading the plugin does not change them; to see them in another
>   language, start bb under a different locale, e.g.
>   `LANG=ru_RU.UTF-8 bb`.
> - **Sidebar panel title** — taken from the browser language when the
>   app loads (slot registration is static); a browser-language change
>   takes effect after reloading the app page.

## Development

```sh
npm ci
bb plugin build .     # needs the bb CLI (npm i -g bb-app)
node --test test/     # server tests against the built bundle
node test/marketplace.test.mjs   # validates marketplace.json
```

The test suite imports the built `dist/server.js` and drives its factory with
a mocked `bb.sdk` — no live BB server needed. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup, the i18n
rules, and the release process.

## License

[MIT](./LICENSE)
