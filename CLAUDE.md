# tripwire

API drift watcher and CI red-flagger. Live at tripwire.jaybulb.com. Came out of a YC RFS pick via sparkjar.

- `worker.js` is the Worker (hourly cron), `web/` the landing page, `tui/` the SwiftPM terminal client (thin fetch against the live API)
- The README is the house writing reference. Do not loosen it
- Deploy with `npx wrangler deploy` from this folder. The CI fixer is `.github/workflows/fix.yml` in this repo (Gemma 3 27B writes the fix via aider on secret `GEMINI_API_KEY`; Claude reviews each PR in a read-only comment when secret `CLAUDE_CODE_OAUTH_TOKEN` is set); the report's `why` field says when a dispatch failed
