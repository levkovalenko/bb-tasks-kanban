# Contributing

Thanks for helping make BB Tasks easier to work with. This guide covers the
development setup, the rules the code follows, and how releases ship.

## Development setup

You need **Node.js 22.19+ / 24+** and the **bb CLI** (any recent version):

```sh
npm install --global bb-app
```

Then:

```sh
npm ci                # install dependencies (incl. @get-bb/plugin-sdk)
bb plugin build .     # compile server.ts + app.tsx into dist/
bb plugin dev .       # optional: watch mode, rebuild + reload on change
```

To try the board on your machine:

```sh
bb plugin install . --yes
```

The panel appears in the left sidebar (Workflow icon). If you have several
BB Tasks projects, the switcher in the toolbar lists them all.

## Tests

```sh
node --test test/server.test.mjs    # server tests (needs a fresh build)
node test/marketplace.test.mjs      # marketplace.json vs the official v2 schema
```

The server tests import the **built** `dist/server.js` and drive its factory
with a mocked `bb.sdk.plugins.callRpc`. They assert the exact method names
and inputs forwarded to the built-in tasks plugin, the reshaping of results,
and that the realtime channel is published exactly on successful writes.
Rebuild (`bb plugin build .`) before running them when you change
`server.ts`.

When the tasks plugin's contracts change (new statuses, DTO fields, method
names), the tests are the place it should break first — update
`server.ts`'s mirrored schemas and the fixtures in `test/server.test.mjs`
together.

## Code layout

```
server.ts            Backend: board_* RPC contract, proxy into the tasks plugin
app.tsx              Frontend: Kanban UI (lanes, cards, dialogs, drag & drop)
lib/i18n.ts          en/ru dictionaries + locale detection
lib/utils.ts, components/, hooks/   UI primitives from the BB plugin scaffold
skills/board/SKILL.md  Agent skill for working the board via `bb tasks`
test/                node:test suites
marketplace.json     Self-hosted marketplace catalog (BB schema v2)
```

### Architecture rules

- **The board is a proxy, never a store.** Do not add plugin storage for
  task data. Every read/write must go through the built-in tasks plugin's
  RPC (`bb.sdk.plugins.callRpc`), so the board and `bb tasks` stay identical.
- **Mirrored schemas in `server.ts`** validate the tasks plugin's DTOs on the
  wire. If you add a field to a DTO, add it to the schema *and* to a test
  fixture.
- **Writes publish** on the `tasks-kanban-changed` realtime channel exactly
  once per successful mutation (keep the `if (res.ok)` guards).

## Internationalization

All UI strings live in `lib/i18n.ts` — one key, one `en` string, one `ru`
string. Rules:

1. Never hardcode a user-facing string in `app.tsx`; call
   `t("some.key")` (or the `laneTitle`/`priorityLabel` helpers).
2. A new key must be added to **both** `en` and `ru` dictionaries; keep the
   key sets identical.
3. Placeholders use `{name}` and are filled with `t("key", { name: … })`.
4. The locale is detected from `navigator.language` once per bundle load
   (`detectLocale()`): Russian for `ru*`, English otherwise. To add a
   language, add a dictionary to `lib/i18n.ts`, export it as `Messages`
   compatible, and extend `DICT`.

## Pull requests

- Small, focused PRs; describe the user-visible change in the PR body.
- `npm ci && bb plugin build . && node --test test/server.test.mjs` must pass
  locally before you open the PR (CI runs the same, plus the marketplace
  validation).
- Update `CHANGELOG.md` under `Unreleased` when the change is user-visible.
- UI changes: capture the before/after in the PR body when the layout moves.

## Releasing

Releases are Git tags; the marketplace entry tracks a semver range
(`^0.x.y`), so tagging is the whole release.

1. Merge the changes to `main`.
2. Bump `version` in `package.json` and add a `CHANGELOG.md` section.
3. Build once, run the full test suite locally.
4. Tag and push:

   ```sh
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin main
   git push origin v0.2.0
   ```

5. Verify: `git ls-remote --tags https://github.com/levkovalenko/bb-tasks-kanban.git`
   and `bb plugin outdated` on a machine with the plugin installed.

Breaking changes to the `board_*` RPC contract or the panel's paths are
major bumps. If you change the package name, the plugin id, the icon, or the
marketplace entry itself, a new reviewed pull request against the BB
Community marketplace is required.

## Reporting issues

Use the [issue templates](.github/ISSUE_TEMPLATE/). For board glitches, the
fastest diagnosis is:

```sh
bb plugin logs tasks-kanban     # the plugin's own log
bb tasks show <KEY> --json      # the ground-truth task state
```

and the BB version (`bb --version`). Plugins run with full trust inside the
BB server — please don't paste tokens or private task content into issues.
