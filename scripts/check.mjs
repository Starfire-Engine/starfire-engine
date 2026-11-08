import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const folders = ['src', 'demo', 'scripts', 'tests'];
let count = 0;
async function check(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const name = join(folder, entry.name);
    if (entry.isDirectory()) await check(name);
    else if (/\.(m?js)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', name], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    }
  }
}
for (const folder of folders) await check(folder);
console.log(`Checked JavaScript syntax in ${count} files.`);
