import { createApp } from './app.mjs';

const { app, close } = await createApp();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, host, () => console.log(`KIDGUARD API: http://${host}:${port}`));
function shutdown() { server.close(() => { close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
