// Entry point: starts the MissionForge room server. See server/README.md for configuration.
import { startServer } from './wire/server.js';

const port = Number(process.env.PORT ?? 8787);
const clientBaseUrl = process.env.CLIENT_BASE_URL ?? 'http://localhost:5173/';

startServer({ port, clientBaseUrl });
// eslint-disable-next-line no-console
console.log(`MissionForge room server listening on ws://localhost:${port} (clientBaseUrl=${clientBaseUrl})`);
