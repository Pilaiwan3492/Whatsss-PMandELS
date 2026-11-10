import { app } from './app.js';
import { config } from './config/env.js';

app.listen(config.port, () => {
  console.log(`Whatsss API server listening on http://localhost:${config.port} in ${config.nodeEnv} mode`);
});
