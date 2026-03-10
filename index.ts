import { client } from "./src/bot/client.js";
import { registerEventHandlers } from "./src/bot/eventHandlers.js";
import { config } from "./src/config/env.js";

registerEventHandlers();
await client.login(config.token);
