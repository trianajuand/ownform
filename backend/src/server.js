import { createApp } from './app.js';
import { createPool } from './db/connection.js';

const port = Number(process.env.PORT ?? 3000);

const pool = createPool(process.env.DATABASE_URL);
const app = createApp({ pool });

const server = app.listen(port, () => {
  console.log(`Ownform API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
