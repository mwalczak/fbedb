const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('./src/app');
const { Store } = require('./src/store');

const PORT = process.env.PORT || 8080;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'events.db');
const PUBLIC_LIST = process.env.PUBLIC_LIST !== 'false';

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const store = new Store(DB_FILE);
if (!process.env.TOKEN) console.warn('TOKEN is not set: posting events and managing Pages are disabled');

const app = createApp({ store, token: process.env.TOKEN, publicList: PUBLIC_LIST });
const server = http.createServer(app);
server.listen(PORT, () => console.log(`listening on :${PORT}, event list ${PUBLIC_LIST ? 'public' : 'behind the token'}`));

process.on('SIGTERM', () => server.close(() => {
  store.close();
  process.exit(0);
}));
