const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const target = path.join(root, '.deployment', 'api');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const entry of ['dist', 'host.json', 'package.json', 'package-lock.json']) {
  fs.cpSync(path.join(root, 'api', entry), path.join(target, entry), { recursive: true });
}
console.log('API staged in .deployment/api; install locked production dependencies before uploading.');
