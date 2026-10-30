const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('SWA protects all API routes and selects the same Node runtime as the packages', () => {
  const config = JSON.parse(read('src/staticwebapp.config.json'));
  assert.equal(config.platform.apiRuntime, 'node:22');
  assert.deepEqual(config.routes, [{ route: '/api/*', allowedRoles: ['acs-user'] }]);
  assert.equal(config.navigationFallback, undefined);
  for (const file of ['package.json','api/package.json','tools/package.json']) assert.equal(JSON.parse(read(file)).engines.node, '22.x');
});
test('only a manual main-branch workflow can reach deployment; CI contains no secrets', () => {
  const ci = YAML.parse(read('.github/workflows/ci.yaml'));
  const deploy = YAML.parse(read('.github/workflows/deploy.yaml'));
  assert.deepEqual(Object.keys(ci.on).sort(), ['pull_request','push']);
  assert.deepEqual(Object.keys(deploy.on), ['workflow_dispatch']);
  assert.equal(deploy.jobs.deploy.if, "github.ref == 'refs/heads/main'");
  assert.equal(deploy.jobs.deploy.environment, 'azure-production');
  assert.ok(!read('.github/workflows/ci.yaml').includes('secrets.'));
  for (const file of fs.readdirSync(path.join(root, '.github/workflows'))) {
    const text = read('.github/workflows/' + file); assert.ok(!/justinyoo|davrous|workflow_run|pull_request_target/.test(text));
    for (const job of Object.values(YAML.parse(text).jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
  }
  const step = deploy.jobs.deploy.steps.find(s => s.with?.action === 'upload');
  assert.equal(step.with.app_location, 'dist'); assert.equal(step.with.api_location, '.deployment/api');
  assert.equal(step.with.skip_app_build, true); assert.equal(step.with.skip_api_build, true);
});
test('ARM templates have no credential outputs, including nested module deployments', () => {
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.outputs) for (const [key, output] of Object.entries(value.outputs)) {
      assert.ok(!/connectionString|deploymentKey|apiKey|token/i.test(key));
      assert.ok(!/listKeys|listSecrets/i.test(JSON.stringify(output)));
    }
    for (const child of Object.values(value)) if (typeof child === 'object') inspect(child);
  }
  inspect(JSON.parse(read('infra/azuredeploy.json'))); inspect(JSON.parse(read('infra/main.json')));
});
test('source tree has no stale bundles or legacy Functions binding registrations', () => {
  assert.ok(!fs.readdirSync(path.join(root,'src')).some(f => /^bundle.*\.js$/.test(f)));
  assert.ok(!fs.existsSync(path.join(root,'api/users/function.json')));
  assert.equal(JSON.parse(read('api/package.json')).main, 'dist/index.js');
});
