// tripwire: watch vendor OpenAPI specs, diff on change, open a GitHub issue
// in the repos that call the endpoints that changed. Also watches CI on every
// repo and flags red builds.
import watches from './watches.json' with { type: 'json' };

const GH = 'https://api.github.com';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const GH_USER = 'nulljosh';
const REPO_LIST_TTL = 6 * 60 * 60; // repo list changes rarely, 6h cache keeps this off the subrequest budget

// ponytail: no more hand-maintained repo arrays in watches.json, list every
// non-fork, non-archived repo on the account and let usages() decide per-watch
// relevance via code search instead.
async function listRepos(env) {
  const cached = await env.KV.get('repos:list', 'json');
  if (cached) return cached;
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(env, `/users/${GH_USER}/repos?per_page=100&page=${page}&type=owner`);
    repos.push(...batch.filter(r => !r.fork && !r.archived).map(r => ({ full_name: r.full_name, default_branch: r.default_branch })));
    if (batch.length < 100) break;
  }
  await env.KV.put('repos:list', JSON.stringify(repos), { expirationTtl: REPO_LIST_TTL });
  return repos;
}

// Flatten an OpenAPI doc into { "GET /path": { params:[...], required:[...] } }
export function ops(spec) {
  const out = {};
  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const params = [...(item.parameters || []), ...(op.parameters || [])].map(p => p.name || p.$ref);
      const body = op.requestBody?.content?.['application/json']?.schema;
      out[`${m.toUpperCase()} ${path}`] = { params: params.sort(), required: (body?.required || []).slice().sort() };
    }
  }
  return out;
}

export function diff(oldSpec, newSpec) {
  const a = ops(oldSpec), b = ops(newSpec);
  const d = { removed: [], added: [], changed: [] };
  for (const k of Object.keys(a)) {
    if (!b[k]) { d.removed.push(k); continue; }
    const lostParams = a[k].params.filter(p => !b[k].params.includes(p));
    const newRequired = b[k].required.filter(r => !a[k].required.includes(r));
    if (lostParams.length || newRequired.length) d.changed.push({ op: k, lostParams, newRequired });
  }
  for (const k of Object.keys(b)) if (!a[k]) d.added.push(k);
  return d;
}

// ponytail: only removed + changed ops are breaking; added is FYI.
const breaking = d => d.removed.length + d.changed.length;
// ponytail: caps subrequests (Workers free-tier limit is 50/invocation); a shared multi-table
// DB spec can have hundreds of changed ops across many repos, and each op costs one GitHub
// code-search call per repo. Budget is shared across the whole watch, not per-repo.
const OPS_CAP = 8;

async function gh(env, path, init = {}) {
  const res = await fetch(GH + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'tripwire', Accept: 'application/vnd.github+json', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// job logs come back as plain text (redirected to blob storage), not JSON
async function ghLog(env, path) {
  const res = await fetch(GH + path, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'tripwire' } });
  if (!res.ok) return '';
  return res.text();
}

// Where does this repo call a path? GitHub code search, path without leading slash and {params}.
async function usages(env, repo, opKey, budget) {
  if (budget.n-- <= 0) return null; // over budget: skip the search, still list the op
  const needle = opKey.split(' ')[1].replace(/\{[^}]+\}/g, '').replace(/\/+$/, '');
  if (needle.length < 4) return [];
  const q = encodeURIComponent(`repo:${repo} "${needle}"`);
  try {
    const r = await gh(env, `/search/code?q=${q}&per_page=10`);
    return r.items.map(i => i.path);
  } catch { return []; } // search is rate-limited / unindexed on tiny repos; best effort
}

async function openIssue(env, w, d, budget) {
  const lines = [`\`${w.spec}\` changed and it touches endpoints this repo may call.\n`];
  const removed = d.removed.slice(0, OPS_CAP), changed = d.changed.slice(0, OPS_CAP);
  const fileLines = files => files === null ? '_code search skipped (subrequest budget)_' : files.length ? files.map(f => `- ${f}`).join('\n') : '_no usages found by code search_';
  for (const op of removed) {
    const files = await usages(env, w.repo, op, budget);
    lines.push(`### REMOVED \`${op}\``, fileLines(files), '');
  }
  for (const c of changed) {
    const files = await usages(env, w.repo, c.op, budget);
    lines.push(`### CHANGED \`${c.op}\``);
    if (c.lostParams.length) lines.push(`- params removed: ${c.lostParams.map(p => `\`${p}\``).join(', ')}`);
    if (c.newRequired.length) lines.push(`- now required: ${c.newRequired.map(p => `\`${p}\``).join(', ')}`);
    lines.push(fileLines(files), '');
  }
  if (d.removed.length > OPS_CAP || d.changed.length > OPS_CAP) lines.push(`_...and ${d.removed.length + d.changed.length - OPS_CAP * 2} more ops not detailed here (capped)._`, '');
  if (d.added.length) lines.push(`### Added (FYI)`, d.added.map(a => `- \`${a}\``).join('\n'), '');
  lines.push('---', 'Paste into Claude Code: `fix every call site listed above against the new spec at ' + w.spec + '`');
  return gh(env, `/repos/${w.repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: `[tripwire] ${w.name}: ${d.removed.length} removed, ${d.changed.length} changed`, body: lines.join('\n'), labels: ['tripwire'] })
  }).catch(async e => { // label may not exist
    if (!String(e).includes('422')) throw e;
    return gh(env, `/repos/${w.repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `[tripwire] ${w.name}`, body: lines.join('\n') }) });
  });
}

// v1: instead of just filing the issue, patch the flagged files and open a PR.
// ponytail: one file-set patch per repo via Workers AI, capped at 3 files (git blob/commit/PR
// calls are expensive against the shared subrequest budget); falls back to the issue silently
// if there's nothing to patch or the model output doesn't parse.
const PATCH_FILES_CAP = 3;

async function contents(env, repo, path, ref) {
  try {
    return await gh(env, `/repos/${repo}/contents/${path}?ref=${ref}`);
  } catch { return null; }
}

async function generatePatch(env, w, d, files) {
  const prompt = `The API at ${w.spec} changed. Removed/changed operations:\n${JSON.stringify(d.removed.concat(d.changed.map(c => c.op)))}\n\n` +
    `Update these files to work with the new API shape. Return ONLY a JSON object mapping file path to the FULL new file content, no markdown fences, no commentary.\n\n` +
    files.map(f => `--- ${f.path} ---\n${f.text}`).join('\n\n');
  const res = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', { messages: [{ role: 'user', content: prompt }] });
  try { return JSON.parse((res.response || '').trim().replace(/^```json?\n?|```$/g, '')); } catch { return null; }
}

async function openFixPR(env, w, d, budget, issueUrl) {
  if (!env.AI) return null;
  const removed = d.removed.slice(0, OPS_CAP), changed = d.changed.slice(0, OPS_CAP);
  const paths = new Set();
  for (const op of removed.concat(changed.map(c => c.op))) {
    if (paths.size >= PATCH_FILES_CAP || budget.n <= 0) break;
    const found = await usages(env, w.repo, op, budget);
    for (const p of found || []) if (paths.size < PATCH_FILES_CAP) paths.add(p);
  }
  if (!paths.size) return null;

  const repoInfo = await gh(env, `/repos/${w.repo}`);
  const base = repoInfo.default_branch;
  const ref = await gh(env, `/repos/${w.repo}/git/ref/heads/${base}`);
  const files = [];
  for (const path of paths) {
    const c = await contents(env, w.repo, path, base);
    if (c && c.encoding !== 'base64') continue;
    if (c) files.push({ path, text: atob(c.content.replace(/\n/g, '')), sha: c.sha });
  }
  if (!files.length) return null;

  const patch = await generatePatch(env, w, d, files);
  if (!patch) return null;

  const branch = `tripwire/${w.name}-${Date.now()}`;
  await gh(env, `/repos/${w.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }) });
  for (const f of files) {
    if (!patch[f.path]) continue;
    await gh(env, `/repos/${w.repo}/contents/${f.path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `tripwire: fix ${f.path} for ${w.name} API change`, content: btoa(patch[f.path]), sha: f.sha, branch })
    });
  }
  const body = `Auto-generated fix for the API drift in ${issueUrl || w.name}.\n\nReview before merging, this was written by a model against the new spec at ${w.spec}.`;
  return gh(env, `/repos/${w.repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: `[tripwire] fix: ${w.name} API drift`, head: branch, base, body }) });
}

export async function run(env) {
  const report = [];
  for (const w of watches) {
    try {
      const headers = { 'User-Agent': 'tripwire' };
      for (const [k, v] of Object.entries(w.headers || {})) headers[k] = v.startsWith('$') ? env[v.slice(1)] : v;
      const res = await fetch(w.spec, { headers });
      if (!res.ok) throw new Error(`spec ${res.status}`);
      const text = await res.text();
      const spec = JSON.parse(text);
      const key = `spec:${w.name}`;
      const prev = await env.KV.get(key, 'json');
      if (!prev) { await env.KV.put(key, text); report.push({ name: w.name, status: 'baseline' }); continue; }
      const d = diff(prev, spec);
      if (!breaking(d) && !d.added.length) { report.push({ name: w.name, status: 'unchanged' }); continue; }
      await env.KV.put(key, text); // save baseline first so a downstream failure can't wedge the diff on repeat
      const issue = [];
      // ponytail: one issue per repo, sequential; fine at <20 repos. Budget shared across
      // repos in this watch keeps a wide-table spec (many repos x many changed ops) under
      // the Workers per-invocation subrequest limit.
      const budget = { n: 30 };
      if (breaking(d)) {
        const allRepos = (await listRepos(env)).map(r => r.full_name);
        for (const repo of allRepos) {
          if (budget.n <= 0) break;
          // Dynamic mode: only file an issue where code search actually finds a call site,
          // otherwise every repo on the account would get a blind issue on every drift.
          const anyOp = d.removed[0] || d.changed[0]?.op;
          const hit = await usages(env, repo, anyOp, budget);
          if (!hit || !hit.length) continue;
          const opened = await openIssue(env, { ...w, repo }, d, budget);
          issue.push(opened.html_url);
          try {
            const pr = await openFixPR(env, { ...w, repo }, d, budget, opened.html_url);
            if (pr) issue.push(pr.html_url);
          } catch { /* best effort, the issue already has the full diff */ }
        }
      }
      report.push({ name: w.name, status: 'changed', diff: d, issue });
    } catch (e) {
      report.push({ name: w.name, status: 'error', error: String(e.message || e) });
    }
  }
  const ci = await ciCheck(env);
  await env.KV.put('last', JSON.stringify({ at: new Date().toISOString(), report, ci }));
  return report;
}

// Failed job logs mention real repo paths (stack traces, "Cannot find module", linter output).
// Only try to patch a path if it actually exists in the repo — if it doesn't (e.g. a file that
// was never committed), there's nothing to safely rewrite and we leave it to the issue.
const CI_PATH_RE = /[\w][\w\-./]*\.(?:js|mjs|cjs|ts|tsx|jsx|py|swift|go|rb|java|kt)\b/g;

async function openCIFixPR(env, repo, branch, run, logTail) {
  if (!env.AI || !logTail) return null;
  const candidates = [...new Set(logTail.match(CI_PATH_RE) || [])].filter(p => p.includes('/')).slice(0, 8);
  const files = [];
  for (const path of candidates) {
    if (files.length >= PATCH_FILES_CAP) break;
    const c = await contents(env, repo, path, branch);
    if (c && c.encoding === 'base64') files.push({ path, text: atob(c.content.replace(/\n/g, '')), sha: c.sha });
  }
  if (!files.length) return null;

  const prompt = `This CI run failed: ${run.html_url}\nLast lines of the failing job's log:\n${logTail}\n\n` +
    `Fix these files so the failure above goes away. Return ONLY a JSON object mapping file path to the FULL new file content, no markdown fences, no commentary.\n\n` +
    files.map(f => `--- ${f.path} ---\n${f.text}`).join('\n\n');
  const res = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', { messages: [{ role: 'user', content: prompt }] });
  let patch;
  try { patch = JSON.parse((res.response || '').trim().replace(/^```json?\n?|```$/g, '')); } catch { return null; }
  if (!patch) return null;

  const ref = await gh(env, `/repos/${repo}/git/ref/heads/${branch}`);
  const prBranch = `tripwire/ci-fix-${run.id}`;
  await gh(env, `/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: ref.object.sha }) });
  let wrote = 0;
  for (const f of files) {
    if (!patch[f.path]) continue;
    await gh(env, `/repos/${repo}/contents/${f.path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `tripwire: fix CI failure in ${f.path}`, content: btoa(patch[f.path]), sha: f.sha, branch: prBranch })
    });
    wrote++;
  }
  if (!wrote) return null;
  const body = `Auto-generated fix for the red CI run: ${run.html_url}\n\nReview before merging, this was written by a model against the failing job's log tail.`;
  return gh(env, `/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: `[tripwire] fix: CI failure in #${run.run_number}`, head: prBranch, base: branch, body }) });
}

// Flag red CI on every repo's default branch. Opens one issue per newly-failed run (dedup'd by
// run id in KV so a repeat cron tick doesn't refile it), naming the failed jobs/steps and linking
// the run, then tries a patch PR from the failing job's log tail. ponytail: only patches paths
// that already exist in the repo (a file that was simply never committed has nothing to rewrite,
// same as the API-drift fixer's "no usages found" ceiling) and only touches PATCH_FILES_CAP files.
async function ciCheck(env) {
  const repos = await listRepos(env);
  const flagged = [];
  for (const { full_name: repo, default_branch: branch } of repos) {
    try {
      const runs = await gh(env, `/repos/${repo}/actions/runs?branch=${branch}&status=completed&per_page=1`);
      const run = runs.workflow_runs?.[0];
      if (!run || run.conclusion === 'success') continue;
      const seenKey = `ci:${repo}`;
      const seen = await env.KV.get(seenKey);
      if (seen === String(run.id)) continue; // already reported this run
      await env.KV.put(seenKey, String(run.id));
      const jobs = await gh(env, `/repos/${repo}/actions/runs/${run.id}/jobs`);
      const failedJobs = (jobs.jobs || []).filter(j => j.conclusion === 'failure');
      const logTail = failedJobs[0] ? (await ghLog(env, `/repos/${repo}/actions/jobs/${failedJobs[0].id}/logs`)).split('\n').slice(-80).join('\n') : '';
      const lines = [
        `CI is red on \`${branch}\`: [${run.name || 'workflow'} #${run.run_number}](${run.html_url}), conclusion \`${run.conclusion}\`.`,
        '',
        ...failedJobs.map(j => `- **${j.name}**: ${(j.steps || []).filter(s => s.conclusion === 'failure').map(s => s.name).join(', ') || 'failed'}`),
        '',
        '---',
        'Paste into Claude Code: `the CI run above is failing, fix it`',
      ];
      const opened = await gh(env, `/repos/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: `[tripwire] CI failing: ${run.name || 'workflow'} #${run.run_number}`, body: lines.join('\n'), labels: ['tripwire'] })
      }).catch(async e => {
        if (!String(e).includes('422')) throw e;
        return gh(env, `/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `[tripwire] CI failing: ${run.name || 'workflow'} #${run.run_number}`, body: lines.join('\n') }) });
      });
      let pr = null;
      try { pr = await openCIFixPR(env, repo, branch, run, logTail); } catch { /* best effort, the issue already links the run */ }
      flagged.push({ repo, run: run.html_url, issue: opened.html_url, pr: pr?.html_url });
    } catch { /* repo has no Actions runs, or API hiccup; best effort */ }
  }
  return flagged;
}

export default {
  scheduled: (_ev, env, ctx) => ctx.waitUntil(run(env)),
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (req.headers.get('x-key') !== env.RUN_KEY) return new Response('nope', { status: 401 });
      return Response.json(await run(env));
    }
    if (url.pathname !== '/api') return env.ASSETS.fetch(req);
    const last = await env.KV.get('last', 'json');
    return Response.json({ watches: watches.map(w => ({ name: w.name })), repoCount: (await listRepos(env)).length, last });
  }
};
