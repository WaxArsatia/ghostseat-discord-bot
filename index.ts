import { client } from "./src/bot/client.js";
import { registerEventHandlers } from "./src/bot/eventHandlers.js";
import { config } from "./src/config/env.js";
import {
  initializeGameStorage,
  shutdownGameRuntime,
} from "./src/game/index.js";
import { shutdownVoiceLeaderboard } from "./src/services/VoiceLeaderboardService.js";
import { destroyAllVoiceConnections } from "./src/services/VoiceService.js";

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Bot] Received ${signal}. Shutting down...`);

  try {
    shutdownGameRuntime();
    await shutdownVoiceLeaderboard();
    destroyAllVoiceConnections();
    client.destroy();
  } catch (error) {
    console.error("[Bot] Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[Bot] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Bot] Uncaught exception:", error);
});

async function main(): Promise<void> {
  initializeGameStorage();
  registerEventHandlers();
  await client.login(config.token);
}

try {
  await main();
} catch (error) {
  console.error("[Bot] Failed to start:", error);
  process.exit(1);
}
