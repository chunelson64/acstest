const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const identity = require('../src/identity');
for (const file of ['videocalls.js', 'videocallsvr.js']) {
  for (const status of ['anonymous', 403, 503]) {
    test(`${file} handles ${status} without initializing media or logging a token`, async () => {
      const elements = new Map(), logs = [], calls = [];
      const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', addEventListener() {} });
        return elements.get(id);
      };
      const fetch = async url => {
        calls.push(url);
        if (url === '/.auth/me') return { json: async () => ({ clientPrincipal: status === 'anonymous' ? null : { userDetails: 'test user' } }) };
        return { ok: false, status };
      };
      const sandbox = {
        require: name => {
          if (name === './identity') return { ...identity, fetchIdentity: () => identity.fetchIdentity(fetch) };
          if (name === '@azure/communication-calling') return { CallClient: class { constructor() { throw new Error('Media must not initialize'); } } };
          if (name === '@azure/logger') return { AzureLogger: {}, setLogLevel() {} };
          return {};
        },
        fetch,
        document: { getElementById: element, querySelector: selector => element(selector.slice(1)), getElementsByClassName: name => [element(name)] },
        window: { location: {} }, navigator: { mediaDevices: { getUserMedia() {} } },
        console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) }
      };
      vm.runInNewContext(fs.readFileSync(require.resolve('../src/' + file), 'utf8'), sandbox, { filename: file });
      await new Promise(setImmediate);
      assert.deepEqual(logs, []);
      if (status === 'anonymous') {
        assert.deepEqual(calls, ['/.auth/me']); assert.equal(element('loginZone').style.display, 'initial');
      } else {
        assert.deepEqual(calls, ['/.auth/me','/api/users/me']);
        assert.equal(element('logoutZone').style.display, 'block');
        assert.match(element('user_email').textContent, status === 403 ? /acs-user/ : /unavailable/);
      }
    });
  }
}
