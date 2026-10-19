// CI watch: one issue per red workflow, closed on green, plus a draft fix PR from the log tail.
import { gh, ghLog, contents, listRepos, fromB64, toB64, parseModelJSON, PATCH_FILES_CAP } from './github.js';

// Failed job logs mention real repo paths (stack traces, "Cannot find module", linter output).
// Only try to patch a path if it actually exists in the repo — if it doesn't (e.g. a file that
// was never committed), there's nothing to safely rewrite and we leave it to the issue.
const CI_PATH_RE = /[\w][\w\-./]*\.(?:js|mjs|cjs|ts|tsx|jsx|py|swift|go|rb|java|kt)\b/g;

// Runner logs print absolute paths (/home/runner/work/<repo>/<repo>/src/a.js). Strip to repo-relative.
export const repoPath = p => p.replace(/^.*?work\/[^/]+\/[^/]+\//, '');

async function openCIFixPR(env, repo, branch, run, logTail, note) {
  if (!env.AI || !logTail) return void (note.why = 'no AI binding or empty job log');
  // ponytail: newest mention first, since the error sits at the bottom of the log; a real
  // stack-trace parser if this picks the wrong files.
  const candidates = [...new Set((logTail.match(CI_PATH_RE) || []).map(repoPath).reverse())].filter(p => p.includes('/')).slice(0, 8);
  const files = [];
  for (const path of candidates) {
    if (files.length >= PATCH_FILES_CAP) break;
    const c = await contents(env, repo, path, branch);
    if (c && c.encoding === 'base64') files.push({ path, text: fromB64(c.content), sha: c.sha });
  }
  if (!files.length) return void (note.why = 'no repo file paths in the log tail');

  const prompt = `This CI run failed: ${run.html_url}\nLast lines of the failing job's log:\n${logTail}\n\n` +
    `Fix these files so the failure above goes away. Return ONLY a JSON object mapping file path to the FULL new file content, no markdown fences, no commentary.\n\n` +
    files.map(f => `--- ${f.path} ---\n${f.text}`).join('\n\n');
  const res = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', { messages: [{ role: 'user', content: prompt }], max_tokens: 8192 });
  const patch = parseModelJSON(res.response);
  if (!patch) return void (note.why = 'model output was not JSON');

  const ref = await gh(env, `/repos/${repo}/git/ref/heads/${branch}`);
  const prBranch = `tripwire/ci-fix-${run.id}`;
  await gh(env, `/repos/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: ref.object.sha }) });
  let wrote = 0;
  for (const f of files) {
    if (!patch[f.path]) continue;
    await gh(env, `/repos/${repo}/contents/${f.path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `tripwire: fix CI failure in ${f.path}`, content: toB64(patch[f.path]), sha: f.sha, branch: prBranch })
    });
    wrote++;
  }
  if (!wrote) return void (note.why = 'model returned none of the files it was given');
  const body = `Auto-generated fix for the red CI run: ${run.html_url}\n\nReview before merging, this was written by a model against the failing job's log tail.`;
  return gh(env, `/repos/${repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: `[tripwire] fix: CI failure in #${run.run_number}`, head: prBranch, base: branch, body, draft: true }) });
}

// Latest completed run per workflow decides. Red with no open issue: file one. Green with an
// open issue: close it. One issue per failing workflow, not per failing run, so a workflow that
// stays red (a 30 minute cron) can't file a new copy every tick.
export function ciPlan(runs, state) {
  const latest = new Map();
  const verdict = ['success', 'failure', 'timed_out']; // a cancelled run (superseded push) says nothing
  for (const r of runs) if (verdict.includes(r.conclusion) && !latest.has(r.workflow_id)) latest.set(r.workflow_id, r);
  const open = [], close = [];
  for (const [wf, r] of latest) {
    const had = state[wf]?.issue;
    if (r.conclusion === 'success') { if (had) close.push({ wf, issue: had }); }
    else if (!had) open.push(r);
  }
  return { open, close };
}

// Flag red CI on every repo's default branch: one issue per newly-red workflow (state in KV,
// one key per repo), naming the failed jobs/steps and linking the run, then tries a patch PR
// from the failing job's log tail. When the PR is skipped, `why` says so in the report.
// ponytail: only patches paths that already exist in the repo (a file that was simply never
// committed has nothing to rewrite, same as the API-drift fixer's "no usages found" ceiling)
// and only touches PATCH_FILES_CAP files.
export async function ciCheck(env) {
  const repos = await listRepos(env);
  const flagged = [];
  for (const { full_name: repo, default_branch: branch } of repos) {
    try {
      const { workflow_runs: runs = [] } = await gh(env, `/repos/${repo}/actions/runs?branch=${branch}&status=completed&per_page=30`);
      const key = `ci2:${repo}`;
      const state = (await env.KV.get(key, 'json').catch(() => null)) || {};
      const { open, close } = ciPlan(runs, state);
      for (const { wf, issue } of close) {
        await gh(env, `/repos/${repo}/issues/${issue}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) }).catch(() => {});
        delete state[wf];
        await env.KV.put(key, JSON.stringify(state));
      }
      for (const run of open) {
        const jobs = await gh(env, `/repos/${repo}/actions/runs/${run.id}/jobs`);
        const failedJobs = (jobs.jobs || []).filter(j => j.conclusion === 'failure');
        const logTail = failedJobs[0] ? (await ghLog(env, `/repos/${repo}/actions/jobs/${failedJobs[0].id}/logs`)).split('\n').slice(-80).join('\n') : '';
        const title = `[tripwire] CI failing: ${run.name || 'workflow'} #${run.run_number}`;
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
          body: JSON.stringify({ title, body: lines.join('\n'), labels: ['tripwire'] })
        }).catch(async e => { // label may not exist
          if (!String(e).includes('422')) throw e;
          return gh(env, `/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title, body: lines.join('\n') }) });
        });
        state[run.workflow_id] = { run: run.id, issue: opened.number };
        await env.KV.put(key, JSON.stringify(state));
        const note = {};
        let pr = null;
        try { pr = await openCIFixPR(env, repo, branch, run, logTail, note); } catch (e) { note.why = `error: ${String(e.message || e).slice(0, 200)}`; }
        flagged.push({ repo, run: run.html_url, issue: opened.html_url, pr: pr?.html_url, why: pr ? undefined : note.why });
      }
    } catch (e) { console.log('ci', repo, String(e.message || e).slice(0, 200)); } // no Actions on the repo, or API hiccup
  }
  return flagged;
}
