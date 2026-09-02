# tripwire Technical Whitepaper

**v1.0.0** | September 2026

Every API you depend on ships breaking changes whenever it feels like it. A
status page tells everyone the same thing. tripwire tells you what broke in
your code. One Worker, one file.

## What it does

A Cloudflare Worker polls each watched vendor's OpenAPI spec on a cron (every
6 hours) and keeps the last version in KV. When the spec changes it diffs the
two: removed endpoints, dropped parameters, new required fields. Then it
searches the configured GitHub repo for calls to what changed and opens an
issue:

> `/v1/charges` is gone. You call it in these three files. Here's the diff.

## Design

- **`watches.json`** lists `{ name, spec, repo }`. Adding a vendor is one line.
- **Spec diff** is structural, over the parsed OpenAPI paths object, not a
  text diff. Only breaking classes are reported; additions are ignored.
- **Repo search** uses the GitHub code search API scoped to the repo, keyed
  on the removed path or parameter name. Results are grouped by file in the
  issue body.
- **Idempotent.** The issue title embeds the spec version hash, so a re-run
  never opens a duplicate.

## Interface

```
GET  /api        last run
POST /api/run    x-key: $RUN_KEY, force a run
secrets          GITHUB_TOKEN (repo + issues), RUN_KEY
```

`node test.js` covers the diff. `npx wrangler deploy` ships it. Full setup in
`DOCS.md`.

## Where it goes

v1 opens the PR with the fix already written. After that, the vendor side:
push fixes into customers' codebases instead of hoping they read the email.

## License

MIT 2026, Joshua Trommel
