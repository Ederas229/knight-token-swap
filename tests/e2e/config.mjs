/**
 * E2E run configuration.
 *
 * Machine-local values (Foundry data folder, world id, login user) are never
 * committed. They resolve from, in order: environment variables, then
 * tests/e2e/config.local.mjs (git-ignored; see config.local.example.mjs), then
 * the dataPath of foundryconfig.json, which a linked development setup already
 * has.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

async function localSettings() {
  const localPath = join(here, 'config.local.mjs');
  if (existsSync(localPath)) return (await import(pathToFileURL(localPath).href)).default ?? {};
  try {
    const config = JSON.parse(await readFile(join(root, 'foundryconfig.json'), 'utf8'));
    const dataPath = Array.isArray(config.dataPath) ? config.dataPath[0] : config.dataPath;
    return dataPath ? { sourceDataPath: dataPath } : {};
  } catch {
    return {};
  }
}

const local = await localSettings();
const pick = (envKey, key) => process.env[envKey] ?? local[key];

const sourceDataPath = pick('E2E_FOUNDRY_DATA_PATH', 'sourceDataPath');
const world = pick('E2E_WORLD', 'world');
const loginUser = pick('E2E_LOGIN_USER', 'loginUser');

const missing = Object.entries({ sourceDataPath, world, loginUser })
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length) {
  throw new Error(
    `E2E config is missing: ${missing.join(', ')}.\n` +
      'Copy tests/e2e/config.local.example.mjs to tests/e2e/config.local.mjs (git-ignored) and fill it in,\n' +
      'or set E2E_FOUNDRY_DATA_PATH, E2E_WORLD and E2E_LOGIN_USER.',
  );
}

// A portable install keeps the Node server bootstrap inside the app tree; other
// layouts point at an unpacked FoundryVTT-Node folder.
const foundryNodePath =
  pick('E2E_FOUNDRY_NODE_PATH', 'foundryNodePath') ?? join(sourceDataPath, 'App', 'resources', 'app');

export default {
  sourceDataPath,
  world,
  loginUser,

  // The suite asserts against a Knight world; the module entry carries the
  // current dist bundle into the isolated copy.
  systemsToCopy: ['knight'],
  modulesToCopy: ['knight-token-swap'],
  worldsToCopy: [world],
  testDataPath: join(root, 'test-data'),

  foundryNodePath,
  diceOverrideExtensionPath: join(root, 'node_modules', 'foundryvtt-test-framework', 'dice-override'),
  foundryServerPort: Number(process.env.E2E_PORT ?? 30005),

  // Generous: the client joins once the server's package update check returns,
  // and only once the server has its package index (see setup.mjs).
  foundryReadyTimeout: 120000,
  serverWarmupMs: 8000,

  // The dice-override extension loads in current Playwright's headless mode
  // (see V14Framework._launchBrowser), so no window is shown.
  headless: true,
};
