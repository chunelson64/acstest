const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HttpRequest, InvocationContext } = require('@azure/functions');
const { createUsersHandler, recordId } = require('../dist/users');
const principal = { identityProvider: 'aad', userId: 'user-1', userDetails: 'person@example.test', userRoles: ['authenticated', 'acs-user'] };
const id = recordId(principal);
const acsId = '8:acs:resource_user';
const expiresOn = new Date(Date.now() + 3600000);
function request(p = principal, options = {}) {
  const headers = { 'x-acs-client': 'web', ...options.headers };
  if (p) headers['x-ms-client-principal'] = typeof p === 'string' ? p : Buffer.from(JSON.stringify(p)).toString('base64');
  return new HttpRequest({ method: options.method || 'POST', url: 'http://localhost/api/users/me' + (options.query || ''), headers, body: options.body ? { string: options.body } : undefined });
}
function fixture(overrides = {}) {
  const calls = [], logs = [];
  const services = {
    find: async key => { calls.push(['find', key]); return { id: key, userId: acsId }; },
    create: async record => { calls.push(['create', record]); },
    createUser: async () => { calls.push(['createUser']); return acsId; },
    deleteUser: async user => { calls.push(['deleteUser', user]); },
    getToken: async user => { calls.push(['getToken', user]); return { token: 'secret-token', expiresOn }; },
    ...overrides
  };
  const handler = createUsersHandler(() => { calls.push(['services']); return services; });
  const context = new InvocationContext({ functionName: 'users', logHandler: (...args) => logs.push(args) });
  return { run: req => handler(req, context), calls, logs, services };
}
for (const [name, value] of Object.entries({ absent: null, malformed: '%%%bad', invalidJSON: 'bm90LWpzb24=', nullJSON: 'bnVsbA==', missingId: { ...principal, userId: '' }, anonymous: { ...principal, userRoles: ['anonymous'] }, invalidRoles: { ...principal, userRoles: 'authenticated' } })) {
  test(`rejects ${name} principal before accessing Azure`, async () => {
    const f = fixture(); assert.equal((await f.run(request(value))).status, 401); assert.deepEqual(f.calls, []);
  });
}
test('requires the invited calling role', async () => {
  const f = fixture(); assert.equal((await f.run(request({ ...principal, userRoles: ['authenticated'] }))).status, 403); assert.deepEqual(f.calls, []);
});
test('rejects GET and cross-site form style requests without touching Azure', async () => {
  const f = fixture(); assert.equal((await f.run(request(principal, { method: 'GET' }))).status, 405);
  assert.equal((await f.run(request(principal, { headers: { 'x-acs-client': '' } }))).status, 400); assert.deepEqual(f.calls, []);
});
test('uses server principal despite an attacker-controlled body and query', async () => {
  const f = fixture(); const r = await f.run(request(principal, { query: '?email=victim@example.test', body: '{"userId":"victim","email":"victim@example.test"}' }));
  assert.equal(r.status, 200); assert.deepEqual(f.calls, [['services'], ['find', id], ['getToken', acsId]]);
  assert.deepEqual(r.jsonBody, { userId: acsId, userToken: 'secret-token', expiresOn: expiresOn.toISOString() });
  assert.equal(r.headers['Cache-Control'], 'no-store'); assert.deepEqual(f.logs, []);
});
test('mapping separates providers and user IDs but survives display-name changes', () => {
  assert.notEqual(id, recordId({ ...principal, identityProvider: 'github' }));
  assert.notEqual(id, recordId({ ...principal, userId: 'user-2' }));
  assert.equal(id, recordId({ ...principal, userDetails: 'renamed@example.test' }));
  assert.match(id, /^v2-[0-9a-f]{64}$/);
});
test('first login persists identity only, before issuing a token', async () => {
  const f = fixture({ find: async () => undefined });
  assert.equal((await f.run(request())).status, 200);
  assert.deepEqual(f.calls, [['services'], ['createUser'], ['create', { id, userId: acsId }], ['getToken', acsId]]);
});
test('renewal always gets a fresh token for the same ACS identity', async () => {
  const f = fixture(); await f.run(request()); await f.run(request());
  assert.equal(f.calls.filter(c => c[0] === 'createUser').length, 0);
  assert.deepEqual(f.calls.filter(c => c[0] === 'getToken'), [['getToken', acsId], ['getToken', acsId]]);
});
test('concurrent first logins converge on the atomic-create winner and delete only the loser', async () => {
  let stored, next = 0; const deleted = [], minted = [];
  const f = fixture({
    find: async () => stored,
    createUser: async () => `8:acs:new_${++next}`,
    create: async r => { if (stored) throw { code: 409 }; stored = r; },
    deleteUser: async uid => deleted.push(uid),
    getToken: async uid => { minted.push(uid); return { token: 'fresh', expiresOn }; }
  });
  const results = await Promise.all([f.run(request()), f.run(request())]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(next, 2);
  assert.deepEqual(minted, [stored.userId, stored.userId]); assert.equal(deleted.length, 1); assert.notEqual(deleted[0], stored.userId);
});
test('does not delete a possibly persisted identity after an ambiguous write failure', async () => {
  const f = fixture({ find: async () => undefined, create: async () => { throw { code: 503 }; } });
  assert.equal((await f.run(request())).status, 503); assert.ok(!f.calls.some(c => ['deleteUser','getToken'].includes(c[0])));
});
for (const stage of ['find', 'createUser', 'getToken']) {
  test(`sanitizes ${stage} failures`, async () => {
    const f = fixture({ ...(stage === 'createUser' ? { find: async () => undefined } : {}), [stage]: async () => { throw new Error('AccountKey=SECRET'); } });
    const r = await f.run(request()); assert.equal(r.status, 503); assert.equal(r.headers['Cache-Control'], 'no-store');
    assert.ok(!JSON.stringify([r, f.logs]).includes('SECRET'));
  });
}
test('configuration failure returns 503 to authorized callers and 401 to anonymous callers', async () => {
  const handler = createUsersHandler(() => { throw new Error('Missing configuration'); });
  const ctx = new InvocationContext({ logHandler: () => {} });
  assert.equal((await handler(request(), ctx)).status, 503); assert.equal((await handler(request(null), ctx)).status, 401);
});
test('corrupt mapping never mints a token', async () => {
  const f = fixture({ find: async () => ({ id: 'other-user', userId: acsId }) });
  assert.equal((await f.run(request())).status, 503); assert.ok(!f.calls.some(c => c[0] === 'getToken'));
});
test('cleanup failure still uses the conflict winner without logging secrets', async () => {
  let reads = 0;
  const f = fixture({ find: async () => ++reads === 1 ? undefined : { id, userId: acsId }, create: async () => { throw { code: 409 }; }, deleteUser: async () => { throw new Error('SECRET'); } });
  assert.equal((await f.run(request())).status, 200); assert.ok(!JSON.stringify(f.logs).includes('SECRET'));
});
