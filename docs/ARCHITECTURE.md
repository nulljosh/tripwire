# Architecture

API drift watcher. Monitors OpenAPI specs for breaking changes, diffs against your code, opens issues. One Worker, no backend beyond KV storage.

## How it runs

A Cloudflare Worker polls vendor OpenAPI specs on a 6-hour cron and stores them in KV. When a spec changes, it diffs against the previous version: endpoint removals, dropped parameters, new required fields. It searches your GitHub repo for calls to what changed and opens an issue with the diff. Web and TUI clients query the Worker for status.

| File | What it owns |
|---|---|
| `web/index.html` | Landing page and dashboard. Shows watched APIs, last check times, diffs. |
| `web/worker.js` | Cloudflare Worker. Polls OpenAPI specs on cron, diffs, searches GitHub repo, opens issues. Stores specs and diffs in KV. |
| `web/watches.json` | Config: array of vendors to watch. Each entry: name, spec URL, GitHub repo. One-line config to add a vendor. |
| `tui/` | Terminal UI. SwiftPM + SwiftTUI. Thin client that fetches status from the live Worker API. |
| `Package.swift` | SwiftPM manifest for the TUI target. |
| `test.js` | Unit tests for diff logic and parsing. |
| `wrangler.toml` | Cloudflare Worker deployment config. KV namespace and cron trigger. |
