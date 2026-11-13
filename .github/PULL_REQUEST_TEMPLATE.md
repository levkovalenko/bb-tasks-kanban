## What

<!-- One or two sentences: what changes for the user? -->

## Why

## How to verify

<!-- Commands, and what to look at on the board. -->

## Checklist

- [ ] `npm ci && bb plugin build .` passes
- [ ] `node --test test/server.test.mjs` passes
- [ ] `node test/marketplace.test.mjs` passes (if marketplace.json changed)
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] New UI strings added to **both** `en` and `ru` in `lib/i18n.ts`
- [ ] Screenshots added to the description when the layout changed
