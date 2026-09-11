
## v1: auto-fix PR (not started)
- worker.js already opens the issue (GITHUB_TOKEN, repos/{w.repo}/issues). Next: have it also generate the fix and open a PR instead of/alongside the issue, per README "Where it goes".
- Needs an LLM call to write the patch from the diff + the flagged call sites, a branch+commit+PR via the GitHub API, and a decision on target: PR by default, direct-to-main only if the user says so (auto-push to main is a one-way door, don't default to it).

## TUI pilot (2026-09-05)
- `tripwire-tui` SwiftPM target (SwiftTUI). `swift build && ./.build/debug/tripwire-tui` shows the last watch report as a terminal card. Needs a real TTY.
