import path from 'node:path';
import { createApp } from '../../server/app.mjs';

const databasePath = path.resolve(process.env.DATABASE_PATH ?? '.artifacts/e2e.sqlite');
if (!databasePath.startsWith(path.resolve('.artifacts') + path.sep) || !path.basename(databasePath).startsWith('e2e')) {
  throw new Error('Browser tests must use a dedicated database in .artifacts.');
}
// Browser regressions share one IP. Account/IP throttling is tested separately
// with production limits in the API tests.
const service = await createApp({ databasePath, apiLimit: 10000, authLimit: 1000 });
const server = service.app.listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
const close = () => server.close(() => { service.close(); process.exit(0); });
process.on('SIGINT', close); process.on('SIGTERM', close);
