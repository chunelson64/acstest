const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchIdentity, credentialOptions, resolveCallee } = require('../src/identity');
const identity = { userId: '8:acs:resource_user', userToken: 'sensitive', expiresOn: new Date(Date.now() + 3600000).toISOString() };
const ok = value => async () => ({ ok: true, json: async () => value });
test('requests only the current user with same-origin credentials and no cache', async () => {
  const result = await fetchIdentity(async (url, options) => {
    assert.equal(url, '/api/users/me'); assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['x-acs-client'], 'web'); assert.equal(options.body, undefined);
    return { ok: true, json: async () => identity };
  }); assert.deepEqual(result, identity);
});
for (const status of [401,403,500,503]) test(`handles HTTP ${status} without exposing response text`, async () => {
  await assert.rejects(fetchIdentity(async () => ({ ok: false, status, json: async () => { throw new Error('Must not parse server error body'); } })), /Sign in|site owner|unavailable/);
});
for (const value of [{}, { ...identity, userToken: '' }, { ...identity, expiresOn: 'bad' }, { ...identity, expiresOn: '2020-01-01' }]) test('rejects malformed or expired identity responses', async () => {
  await assert.rejects(fetchIdentity(ok(value)), /invalid identity/);
});
test('credential proactively refreshes and refuses to switch accounts', async () => {
  const opts = credentialOptions(identity, ok({ ...identity, userToken: 'renewed' }));
  assert.equal(opts.token, 'sensitive'); assert.equal(opts.refreshProactively, true); assert.equal(await opts.tokenRefresher(), 'renewed');
  await assert.rejects(credentialOptions(identity, ok({ ...identity, userId: '8:acs:other' })).tokenRefresher(), /account changed/);
});
test('callee input accepts shared IDs and refuses email lookup or injected URLs', () => {
  assert.equal(resolveCallee(identity.userId), identity.userId);
  for (const invalid of ['person@example.test','../users/victim','https://evil.test',null,'8:acs:']) assert.equal(resolveCallee(invalid), undefined);
});
