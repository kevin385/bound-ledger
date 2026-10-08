import { startFinance } from './index.ts';
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--port' || !/^[0-9]{1,5}$/.test(args[1] ?? '') || Number(args[1]) > 65535)) {
  console.error('Usage: node dist/main.js [--port 0..65535]');
  process.exit(1);
}
try {
  const app = await startFinance({ port: args.length ? Number(args[1]) : 4318 });
  console.log(`Bound Ledger (synthetic-only pre-alpha): ${app.url}`);
  const stop = () => { void app.close().then(() => process.exit(0), () => process.exit(1)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch {
  // Never include file paths, records, form values, SQL, or secrets in logs.
  console.error('Cannot open the local workspace. Check private runtime permissions, schema compatibility, and port availability. No automatic repair was attempted.');
  process.exitCode = 1;
}
