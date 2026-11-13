import { app } from './app.js';
import { config } from './config/env.js';

app.listen(config.port, config.host, () => {
  console.log(`Whatsss API server listening on http://${config.host}:${config.port} in ${config.nodeEnv} mode`);
});
