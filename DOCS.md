# Tripwire docs

Everything you need to add a watch, run it, read an issue, and fix it when it breaks.

## How it works, in one breath

Cron fires every 6 hours. For each entry in `watches.json` the worker fetches the OpenAPI
spec, parses it into a flat map of `METHOD /path` to its params and required body fields,
and compares that to the copy it saved last time in KV. If any endpoint disappeared, lost a
param, or grew a new required field, it code-searches each listed repo for that path and
opens a GitHub issue naming the files. Then it saves the new spec as the baseline.

The first run for any watch only stores a baseline. Nothing is diffed until the second run.

## Files

| File | What |
|------|------|
| `worker.js` | the whole thing: fetch, diff, search, issue, cron, tiny API |
| `watches.json` | what to watch and which repos care |
| `web/` | landing page, served as static assets |
| `test.js` | the one check that fails if the diff logic breaks |
| `wrangler.toml` | cron, KV binding, custom domain |
| `.runkey` | local copy of `RUN_KEY`, gitignored |

## Adding a watch

Append to `watches.json`:

```json
{
  "name": "stripe",
  "spec": "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
  "repos": ["nulljosh/healstack", "nulljosh/talli"]
}
```

- `name` is the KV key and the issue title prefix. Keep it short, keep it stable. Renaming it
  means a fresh baseline.
- `spec` must return OpenAPI 3 as **JSON**. YAML is not parsed. Most vendors publish JSON on
  GitHub; search `<vendor> openapi github`.
- `repos` is every repo that calls this API. One issue per repo when something breaks.
- `headers` is optional. A value starting with `$` is read from a worker secret, so keys never
  land in git:

```json
{
  "name": "supabase-spark-db",
  "spec": "https://<ref>.supabase.co/rest/v1/",
  "headers": { "apikey": "$SUPABASE_KEY" },
  "repos": ["nulljosh/sparkjar"]
}
```

That Supabase one is worth calling out. PostgREST serves an OpenAPI doc of your own tables
at `/rest/v1/`, so this watch catches schema drift on the shared database: a dropped column
or table shows up as a changed or removed endpoint in every app that uses it.

Then deploy and force a run to store the baseline:

```sh
npx wrangler deploy
curl -X POST -H "x-key: $(cat .runkey)" https://tripwire.heyitsmejosh.com/api/run
```

## Current watches

| Watch | Spec | Repos |
|-------|------|-------|
| stripe | stripe/openapi spec3.json | healstack, epiphany, sparkjar, talli |
| github | github/rest-api-description | cadence, epiphany, nimble, sparkjar |
| resend | resend/resend-openapi resend.json | sparkjar |
| supabase-spark-db | PostgREST OpenAPI of the shared project | sparkjar, litigate, lexly, healstack, homeward, bookrank, bcgd |

APIs we call that publish no OpenAPI JSON, so cannot be watched yet: Yelp, Alpaca, Yahoo
Finance, CoinGecko, Nominatim, adsb.lol, Trakt, Wikipedia. If one of them starts publishing
a spec, add it.

## Secrets

| Secret | Used for | Set with |
|--------|----------|----------|
| `GITHUB_TOKEN` | code search + opening issues; needs `repo` scope | `gh auth token \| npx wrangler secret put GITHUB_TOKEN` |
| `RUN_KEY` | guards `POST /api/run` | `openssl rand -hex 16 \| tee .runkey \| npx wrangler secret put RUN_KEY` |
| `SUPABASE_KEY` | `$SUPABASE_KEY` header in watches | `supabase projects api-keys --project-ref <ref>` then `wrangler secret put` |

Wrangler on this machine needs OAuth, not the DNS token: prefix commands with
`env -u CLOUDFLARE_API_TOKEN`.

## API

| Route | What |
|-------|------|
| `GET /api` | watches + the last run's report |
| `POST /api/run` with `x-key: <RUN_KEY>` | run every watch now, return the report |

A report line per watch: `baseline` (first sight), `unchanged`, `changed` (with the diff and
issue URLs), or `error`.

## Reading an issue

Title: `[tripwire] stripe: 1 removed, 2 changed`. Body has one section per broken endpoint:

- `REMOVED GET /v1/foo` followed by the files that mention `/v1/foo`
- `CHANGED POST /v1/bar` with `params removed:` and `now required:` lines, then files
- `Added (FYI)` for new endpoints, no action needed
- a one-line prompt to paste into Claude Code to fix every call site

"no usages found by code search" means the repo doesn't call it, or GitHub hasn't indexed the
repo yet (small or brand new repos sometimes aren't). Grep locally to be sure.

## Testing without waiting for a vendor to break something

Seed a mutated spec into KV as the baseline, then run. The diff against the real spec fires:

```sh
curl -s https://petstore3.swagger.io/api/v3/openapi.json \
  | python3 -c "import json,sys;s=json.load(sys.stdin);s['paths']['/v1/gone']={'get':{}};print(json.dumps(s))" > /tmp/mut.json
env -u CLOUDFLARE_API_TOKEN npx wrangler kv key put --remote \
  --namespace-id d78a9e892eaa44ccb76f61f6f81ace84 spec:petstore --path /tmp/mut.json
curl -X POST -H "x-key: $(cat .runkey)" https://tripwire.heyitsmejosh.com/api/run
```

Unit check for the diff itself: `node test.js`.

## Limits and gotchas

- Workers Free allows 5 cron triggers per account. Tripwire holds one. If a deploy says the
  limit is hit, something else is squatting a slot.
- KV values cap at 25 MB. GitHub's spec is about 10 MB and Stripe's about 8 MB, both fine.
- Only added, removed, and changed operations are detected. Response schema changes are not
  diffed yet. That's the first thing to add if a vendor changes a field type on you.
- Issues are opened on every change with no dedupe. If a vendor flaps, you get two issues.
- A watch that errors keeps its old baseline and reports `error`; nothing is lost.

## What v1 looks like

Open a PR instead of an issue. Clone the repo in a Sandbox, hand the diff and call sites to
an agent, push a branch. Everything else stays the same.
