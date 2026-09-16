
## Pivot: fleet CI auto-fix becomes the headline product (direct decision, 2026-09-15)

Direct call from Joshua after a mixup where he assumed tripwire already watched his own repos' GitHub Actions and auto-PR'd fixes -- it never did, it only watches third-party vendor OpenAPI specs for breaking changes. His own words: "i dont give a fuck about stripe field renames and vendor endpoint changes as much as I care about CI on my own repos; and users will care about that too. they want their repos passing CI."

**New direction**: tripwire's headline feature becomes watching GitHub Actions across his repos (and eventually any user's repos), diagnosing a real failure's root cause, and opening a PR with the fix already written -- the same "root cause, not symptom" discipline this fleet already holds itself to everywhere else. The existing vendor-API-drift watcher (OpenAPI spec diffing, "this endpoint just got nuked, here's the three files that call it") stays as a secondary mode, not the pitch -- it's already built and shipped, just not what gets led with anymore.

**Not started yet.** This is a real product/architecture decision, not a mechanical fix -- needs its own session: new worker logic (poll `gh run list`/webhook per watched repo instead of an OpenAPI cron), a real root-cause diagnosis step (read the failed job's log, not just "it's red"), and a rewritten README/pitch leading with "your CI, not vendor APIs." Deferred here rather than rushed mid a different project's own crunch (joshuatree work, 94%+ weekly usage at time of this entry).

## TUI pilot (2026-09-05)
- `tripwire-tui` SwiftPM target (SwiftTUI). `swift build && ./.build/debug/tripwire-tui` shows the last watch report as a terminal card. Needs a real TTY.
