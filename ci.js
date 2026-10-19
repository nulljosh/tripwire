// CI watch: one issue per red workflow, closed on green, and a Claude Code fix run per issue.
import { gh, listRepos } from './github.js';

// The fix runs in GitHub Actions (labs .github/workflows/tripwire-fix.yml): Claude Code in a
// throwaway checkout reproduces the failure, fixes the root cause, re-runs the step and opens the
// PR. A Worker can't run a test suite, so it only hands the job off.
const FIXER = 'nulljosh/labs';
const dispatchFix = (env, repo, run, issue) => gh(env, `/repos/${FIXER}/actions/workflows/tripwire-fix.yml/dispatches`, {
  method: 'POST',
  body: JSON.stringify({ ref: 'main', inputs: { repo, run_id: String(run.id), issue: String(issue) } })
});

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
// one key per repo), naming the failed jobs/steps and linking the run, then dispatches the fixer.
// If the dispatch fails, `why` says so in the report.
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
        const title = `[tripwire] CI failing: ${run.name || 'workflow'} #${run.run_number}`;
        const lines = [
          `CI is red on \`${branch}\`: [${run.name || 'workflow'} #${run.run_number}](${run.html_url}), conclusion \`${run.conclusion}\`.`,
          '',
          ...failedJobs.map(j => `- **${j.name}**: ${(j.steps || []).filter(s => s.conclusion === 'failure').map(s => s.name).join(', ') || 'failed'}`),
          '',
          '---',
          'tripwire is on it: a fix PR or an explanation lands here shortly.',
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
        let why;
        try { await dispatchFix(env, repo, run, opened.number); } catch (e) { why = `fixer dispatch failed: ${String(e.message || e).slice(0, 200)}`; }
        flagged.push({ repo, run: run.html_url, issue: opened.html_url, fix: why ? undefined : 'dispatched', why });
      }
    } catch (e) { console.log('ci', repo, String(e.message || e).slice(0, 200)); } // no Actions on the repo, or API hiccup
  }
  return flagged;
}
