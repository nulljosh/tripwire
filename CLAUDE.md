# tripwire

API drift watcher and CI red-flagger. Live at tripwire.jaybulb.com. Came out of a YC RFS pick via sparkjar.

- `worker.js` is the Worker (hourly cron), `web/` the landing page, `tui/` the SwiftPM terminal client (thin fetch against the live API)
- The README is the house writing reference. Do not loosen it
- Deploy with `npx wrangler deploy` from this folder. CI fix PRs are a draft, none opened yet; the report's `why` field says why each was skipped
