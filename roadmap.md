
## TUI pilot (2026-09-05)
- `tripwire-tui` SwiftPM target (SwiftTUI). `swift build && ./.build/debug/tripwire-tui` shows the last watch report as a terminal card. Needs a real TTY.

## From Notes (2026-09-12)
- [x] GitHub note: tripwire should have caught a recent GitHub issue — root cause: co-stanza, epiphany, inkpress, and quotestreak all use the shared spark Supabase DB but were missing from the supabase-spark-db watch list, so schema drift there could never open an issue. Added all four, redeployed.
