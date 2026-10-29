// Starts the isolated Foundry server and keeps it up; used to drive the
// diagnostic probes by hand. Ctrl+C to stop.
import { FoundryTestFramework } from 'foundryvtt-test-framework';
import config from './config.mjs';

const handle = await FoundryTestFramework.startServer(config);
console.log('[probe-server] ready on port', config.foundryServerPort);
process.on('SIGINT', async () => {
  await FoundryTestFramework.stopServer(handle);
  process.exit(0);
});
await new Promise(() => {});
