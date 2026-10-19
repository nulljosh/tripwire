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
