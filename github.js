// GitHub plumbing and model-output parsing shared by the API-drift and CI fixers.

export const GH = 'https://api.github.com';
export const GH_USER = 'nulljosh';
export const REPO_LIST_TTL = 6 * 60 * 60; // repo list changes rarely, 6h cache keeps this off the subrequest budget

// ponytail: no more hand-maintained repo arrays in watches.json, list every
// non-fork, non-archived repo on the account and let usages() decide per-watch
// relevance via code search instead.
export async function listRepos(env) {
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

export async function gh(env, path, init = {}) {
  const res = await fetch(GH + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'tripwire', Accept: 'application/vnd.github+json', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// job logs come back as plain text (redirected to blob storage), not JSON
export async function ghLog(env, path) {
  // The API answers 302 to a signed blob URL. Following it with our Authorization header still
  // attached makes the blob store refuse, so follow it by hand without the header.
  const res = await fetch(GH + path, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'tripwire' }, redirect: 'manual' });
  const loc = res.headers.get('location');
  const log = loc ? await fetch(loc) : res;
  if (!log.ok) return '';
  return log.text();
}

// ponytail: patches cap at 3 files (git blob/commit/PR calls are expensive against the shared
// subrequest budget).
export const PATCH_FILES_CAP = 3;

// GitHub contents are base64 of UTF-8 bytes; bare atob/btoa treat them as Latin-1 and mangle
// anything outside ASCII (an early fix PR turned "Beyonce" with its accent into junk).
export const fromB64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
export function toB64(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function contents(env, repo, path, ref) {
  try {
    return await gh(env, `/repos/${repo}/contents/${path}?ref=${ref}`);
  } catch { return null; }
}


// Workers AI hands back a string, or an already-parsed object for some models. Strip fences either way.
export function parseModelJSON(r) {
  if (r && typeof r === 'object') return r;
  try { return JSON.parse(String(r || '').trim().replace(/^```(?:json)?\n?|\n?```$/g, '')); } catch { return null; }
}
