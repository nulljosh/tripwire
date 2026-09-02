// tripwire: watch vendor OpenAPI specs, diff on change, open a GitHub issue
// in the repos that call the endpoints that changed.
import watches from './watches.json' with { type: 'json' };

const GH = 'https://api.github.com';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

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

async function gh(env, path, init = {}) {
  const res = await fetch(GH + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'tripwire', Accept: 'application/vnd.github+json', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Where does this repo call a path? GitHub code search, path without leading slash and {params}.
async function usages(env, repo, opKey) {
  const needle = opKey.split(' ')[1].replace(/\{[^}]+\}/g, '').replace(/\/+$/, '');
  if (needle.length < 4) return [];
  const q = encodeURIComponent(`repo:${repo} "${needle}"`);
  try {
    const r = await gh(env, `/search/code?q=${q}&per_page=10`);
    return r.items.map(i => i.path);
  } catch { return []; } // search is rate-limited / unindexed on tiny repos; best effort
}

async function openIssue(env, w, d) {
  const lines = [`\`${w.spec}\` changed and it touches endpoints this repo may call.\n`];
  for (const op of d.removed) {
    const files = await usages(env, w.repo, op);
    lines.push(`### REMOVED \`${op}\``, files.length ? files.map(f => `- ${f}`).join('\n') : '_no usages found by code search_', '');
  }
  for (const c of d.changed) {
    const files = await usages(env, w.repo, c.op);
    lines.push(`### CHANGED \`${c.op}\``);
    if (c.lostParams.length) lines.push(`- params removed: ${c.lostParams.map(p => `\`${p}\``).join(', ')}`);
    if (c.newRequired.length) lines.push(`- now required: ${c.newRequired.map(p => `\`${p}\``).join(', ')}`);
    lines.push(files.length ? files.map(f => `- ${f}`).join('\n') : '_no usages found by code search_', '');
  }
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

export async function run(env) {
  const report = [];
  for (const w of watches) {
    try {
      const res = await fetch(w.spec, { headers: { 'User-Agent': 'tripwire' } });
      if (!res.ok) throw new Error(`spec ${res.status}`);
      const text = await res.text();
      const spec = JSON.parse(text);
      const key = `spec:${w.name}`;
      const prev = await env.KV.get(key, 'json');
      if (!prev) { await env.KV.put(key, text); report.push({ name: w.name, status: 'baseline' }); continue; }
      const d = diff(prev, spec);
      if (!breaking(d) && !d.added.length) { report.push({ name: w.name, status: 'unchanged' }); continue; }
      let issue = null;
      if (breaking(d)) issue = (await openIssue(env, w, d)).html_url;
      await env.KV.put(key, text);
      report.push({ name: w.name, status: 'changed', diff: d, issue });
    } catch (e) {
      report.push({ name: w.name, status: 'error', error: String(e.message || e) });
    }
  }
  await env.KV.put('last', JSON.stringify({ at: new Date().toISOString(), report }));
  return report;
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
    return Response.json({ watches: watches.map(w => ({ name: w.name, repo: w.repo })), last });
  }
};
