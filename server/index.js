import { createApp } from './app.js';
import { config } from '../src/config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[35L] Classmate Discovery running at http://localhost:${config.port}`);
  console.log(`[35L] Database: ${config.databasePath}`);
});
