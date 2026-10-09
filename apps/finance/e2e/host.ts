// Test-only child process: trusted synthetic directory, no production path flag.
import { startFinance } from '../dist/index.js';
const stateDirectory = process.argv[2];
if (!stateDirectory) throw new Error('Synthetic test directory required');
const app = await startFinance({ port: Number(process.argv[3] ?? 0), stateDirectory });
process.send?.({ url: app.url, runtime: process.version });
process.on('message', message => {
  if (message === 'stop') void app.close().then(() => process.disconnect?.());
});
