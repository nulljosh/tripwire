# Architecture

Tripwire watches the outside services your code depends on and warns you before they break it.

Most services publish a description of what they offer: which requests they accept, what you have to send, what comes back. Tripwire keeps a copy of that description. When the company quietly changes it, drops a feature, renames something, or starts demanding a field it never asked for before, Tripwire notices. It then looks through your own code for the parts that used the thing that changed, and files a ticket on your project saying exactly what moved and where it will hurt.

No dashboard to check and no agent to install. It runs itself and only speaks up when something is actually wrong.

## How it runs

One small program runs on Cloudflare's network every six hours. It downloads each service's current description, stores it, and compares it to the copy from last time. If anything was removed, renamed, or newly required, it searches your GitHub repository for code that touches it and opens an issue with the details. The web page and the terminal client just read the current status from that same program. Everything it remembers is kept in Cloudflare's key-value storage; there is no database and no server to run.

| File | What it owns |
|---|---|
| `web/index.html` | Landing page and dashboard. Shows watched APIs, last check times, diffs. |
| `web/worker.js` | Cloudflare Worker. Polls OpenAPI specs on cron, diffs, searches GitHub repo, opens issues. Stores specs and diffs in KV. |
| `web/watches.json` | Config: array of vendors to watch. Each entry: name, spec URL, GitHub repo. One-line config to add a vendor. |
| `tui/` | Terminal UI. SwiftPM + SwiftTUI. Thin client that fetches status from the live Worker API. |
| `Package.swift` | SwiftPM manifest for the TUI target. |
| `test.js` | Unit tests for diff logic and parsing. |
| `wrangler.toml` | Cloudflare Worker deployment config. KV namespace and cron trigger. |
