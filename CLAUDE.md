# tripwire

API drift watcher and CI red-flagger. Live at tripwire.jaybulb.com. Came out of a YC RFS pick via sparkjar.

- `worker.js` is the Worker (hourly cron), `web/` the landing page, `tui/` the SwiftPM terminal client (thin fetch against the live API)
- The README is the house writing reference. Do not loosen it
- Deploy with `npx wrangler deploy` from this folder. The CI fixer is `.github/workflows/tripwire-fix.yml` at the labs root (Claude Code on Joshua's Max token, secret `CLAUDE_CODE_OAUTH_TOKEN`, valid to Oct 2027); the report's `why` field says when a dispatch failed
