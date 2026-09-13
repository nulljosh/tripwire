# tripwire Technical Whitepaper

**v1.0.0** | September 2026

Every API you depend on ships breaking changes whenever it feels like it. A
status page tells everyone the same thing, which is useless when what you
actually need to know is whether it broke you specifically. tripwire exists
to answer that question instead: it tells you what broke in your code. One
Worker, one file, because the job is small enough that anything more would
just be more surface area to maintain.

## What it does

A Cloudflare Worker polls each watched vendor's OpenAPI spec on a cron (every
6 hours) and keeps the last version in KV. When the spec changes it diffs the
two: removed endpoints, dropped parameters, new required fields. Then it
searches the configured GitHub repo for calls to what changed and opens an
issue:

> `/v1/charges` is gone. You call it in these three files. Here's the diff.

## Design

- **`watches.json`** lists `{ name, spec, repo }`. Adding a vendor is one line,
  because the whole point is that watching a new API should never require code.
- **Spec diff** is structural, over the parsed OpenAPI paths object, not a
  text diff, since a text diff would flag reordered fields and cosmetic
  changes that never break a caller. Only breaking classes are reported;
  additions are ignored.
- **Repo search** uses the GitHub code search API scoped to the repo, keyed
  on the removed path or parameter name, so the issue points at exactly the
  lines that need fixing instead of "something in this spec changed."
  Results are grouped by file in the issue body.
- **Idempotent.** The issue title embeds the spec version hash, so a re-run
  never opens a duplicate, which matters on a 6-hour cron that will otherwise
  spam the same finding forever.

## Interface

```
GET  /api        last run
POST /api/run    x-key: $RUN_KEY, force a run
secrets          GITHUB_TOKEN (repo + issues), RUN_KEY
```

`node test.js` covers the diff. `npx wrangler deploy` ships it. Full setup in
`DOCS.md`.

## Where it goes

v1 opens the PR with the fix already written, because an issue still requires
someone to notice it and do the work; a PR only requires someone to merge it.
After that, the vendor side: push fixes into customers' codebases instead of
hoping they read the email.

## License

MIT 2026, Joshua Trommel
