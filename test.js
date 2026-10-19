import assert from 'node:assert/strict';
import { diff } from './worker.js';
const a = { paths: { '/v1/charges': { get: { parameters: [{ name: 'limit' }] }, post: { requestBody: { content: { 'application/json': { schema: { required: ['amount'] } } } } } }, '/v1/old': { delete: {} } } };
const b = { paths: { '/v1/charges': { get: {}, post: { requestBody: { content: { 'application/json': { schema: { required: ['amount', 'currency'] } } } } } }, '/v1/new': { get: {} } } };
const d = diff(a, b);
assert.deepEqual(d.removed, ['DELETE /v1/old']);
assert.deepEqual(d.added, ['GET /v1/new']);
assert.deepEqual(d.changed, [
  { op: 'GET /v1/charges', lostParams: ['limit'], newRequired: [] },
  { op: 'POST /v1/charges', lostParams: [], newRequired: ['currency'] }
]);
assert.deepEqual(diff(a, a), { removed: [], added: [], changed: [] });
console.log('ok');
const { ciPlan } = await import('./worker.js');
const run = (workflow_id, id, conclusion) => ({ workflow_id, id, conclusion });
// newest first: wf 1 red twice (one issue only), wf 2 red with an open issue (skip), wf 3 green with an open issue (close), wf 4 cancelled (ignore)
const plan = ciPlan([run(1, 9, 'failure'), run(1, 8, 'failure'), run(2, 7, 'failure'), run(3, 6, 'success'), run(4, 5, 'cancelled')], { 2: { issue: 20 }, 3: { issue: 30 } });
assert.deepEqual(plan.open.map(r => r.id), [9]);
assert.deepEqual(plan.close, [{ wf: 3, issue: 30 }]);
console.log('ci ok');
