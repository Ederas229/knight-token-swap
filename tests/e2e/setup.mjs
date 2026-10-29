import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runSetup } from 'foundryvtt-test-framework/setup';
import config from './config.mjs';

await runSetup(config);

// The core/system update check the client runs while joining needs the package
// index; without it the server asks foundryvtt.com, which can answer 403 and
// leaves the client with a ReleaseData validation error and no game.ready.
// Reusing the install's cached index keeps the launch offline and fast.
const index = join(config.sourceDataPath, 'Config', 'package-index.json');
try {
  await cp(index, join(config.testDataPath, 'Config', 'package-index.json'));
  console.log('  Copied package index');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

// Copied packages keep their hosted manifest URLs, so the Foundry server spends
// its pre-join update check waiting on github.com. Strip them: an update check
// has nothing to fetch and the suite never installs anything.
for (const kind of ['systems', 'modules']) {
  const dir = join(config.testDataPath, 'Data', kind);
  const file = kind === 'systems' ? 'system.json' : 'module.json';
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      // Module installs symlinked to the repo's dist/ stay live-linked, so a
      // rebuilt bundle reaches the test world without re-running setup.
      console.log(`  Left as symlink: ${kind}/${entry.name}`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, file);
    try {
      const json = JSON.parse(await readFile(path, 'utf8'));
      for (const key of ['manifest', 'latest', 'download']) delete json[key];
      await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
      console.log(`  Cleared update URLs: ${kind}/${entry.name}`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}
