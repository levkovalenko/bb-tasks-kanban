# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-11-14

### Changed

- Settings page labels are now localized (RU/EN) at plugin load from the
  host/browser locale, instead of hardcoded English.
- Board language and Card sort order settings use proper select controls
  with localized option labels.

### Documentation

- README (EN/RU): documented that settings-page labels and the sidebar
  panel title are fixed at plugin load (host/browser language), while the
  board content always follows the Board language setting.

## [0.2.0] - 2026-11-14

### Added

- Plugin settings, rendered by the host on the plugin's settings page:
  - **Board language** (`auto` / `en` / `ru`) — overrides the browser-based
    locale detection; the board re-renders in the chosen language.
  - **Card sort order** (`manual` / `due` / `priority`, default `due`) —
    order of cards within a lane.
  - **Description on cards** — two-line description preview, default on.
  - **Lane visibility** — show or hide any of the six status columns
    (for example, hide Canceled for a five-column board).
- `board_settings_get` / `board_settings_set` RPC methods.
- Settings changes publish on `tasks-kanban-changed`, so every open board
  reacts immediately — no reload needed.

## [0.1.1] - 2026-11-14

### Changed

- Panel and plugin branding icon: `Workflow` → `SectionMove`.

## [0.1.0] - 2026-11-13

### Added

- Project-wide "Task board" nav panel: a Kanban over BB's built-in Tasks.
- Six status lanes (backlog, todo, in_progress, in_review, done, canceled)
  with per-lane counts.
- Drag & drop between lanes, including drop-before-card ordering, via the
  Tasks plugin's `boardMove` (real moves, realtime refresh).
- Task dialog: edit title, description, status, priority, due date, labels;
  delete with confirmation.
- Comment history: read and write the task's comments from the dialog.
- New-task dialog (title, description, status, priority, due date, labels).
- Tracker-project switcher; the project linked to the current BB project is
  preselected.
- Overdue due dates highlighted on cards.
- English and Russian UI, picked from the BB/browser language
  (`lib/i18n.ts`).
- `board` skill so agents can work the board through `bb tasks`.
- Server test suite (built bundle + mocked `bb.sdk`) and CI: build with
  `bb plugin build`, `node --test`, marketplace catalog validation against
  the official BB marketplace v2 schema.
- Self-hosted marketplace catalog (`marketplace.json`, schema v2) in the
  repository root.
