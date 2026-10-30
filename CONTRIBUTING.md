# Contributing to Tripwire

Tripwire is an API drift watcher — a Cloudflare Worker that polls endpoints on a schedule and flags when a response shape changes. Live at tripwire.heyitsmejosh.com. See `DOCS.md` for how the watch/diff engine works.

## Setup

```
git clone https://github.com/nulljosh/tripwire.git
cd tripwire
npm install
```

## Test

```
npm test
```

Runs `test.js` against the diffing logic in `worker.js`.

## Run locally

```
wrangler dev
```

Needs a `wrangler.toml`-configured KV binding for storing watch state — see `watches.json` for the shape a watch config takes.

## Making a change

- Core diff/watch logic lives in `worker.js`; the CLI is under `tui/`, the dashboard under `web/`.
- Add a watch fixture to `watches.json` and a matching case in `test.js` for new diff behavior.
- Run `npm test` before opening a PR.

## Deploy

```
npm run deploy
```

Maintainer-only — requires the project's Cloudflare account access.
