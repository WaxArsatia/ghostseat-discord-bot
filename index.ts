import { client } from "./src/bot/client.js";
import { deployGuildCommands } from "./src/bot/deployCommands.js";
import { registerEventHandlers } from "./src/bot/eventHandlers.js";
import { config } from "./src/config/env.js";
import {
  initializeGameStorage,
  shutdownGameRuntime,
} from "./src/game/index.js";
import { destroyAllVoiceConnections } from "./src/services/VoiceService.js";

const COMMAND_DEPLOY_MAX_ATTEMPTS = 3;
const COMMAND_DEPLOY_RETRY_BASE_MS = 5_000;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Bot] Received ${signal}. Shutting down...`);

  try {
    shutdownGameRuntime();
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

async function deployGuildCommandsBestEffort(): Promise<void> {
  for (let attempt = 1; attempt <= COMMAND_DEPLOY_MAX_ATTEMPTS; attempt += 1) {
    try {
      await deployGuildCommands();
      return;
    } catch (error) {
      console.error(
        `[Deploy] Slash command deployment attempt ${attempt}/${COMMAND_DEPLOY_MAX_ATTEMPTS} failed:`,
        error,
      );

      const hasNextAttempt = attempt < COMMAND_DEPLOY_MAX_ATTEMPTS;
      if (!hasNextAttempt) {
        console.error(
          "[Deploy] Continuing without refreshed slash commands. Run deployment manually after recovery.",
        );
        return;
      }

      const delayMs = COMMAND_DEPLOY_RETRY_BASE_MS * attempt;
      console.log(
        `[Deploy] Retrying slash command deployment in ${Math.round(delayMs / 1000)}s...`,
      );
      await sleep(delayMs);
    }
  }
}

async function main(): Promise<void> {
  initializeGameStorage();
  registerEventHandlers();
  await client.login(config.token);
  void deployGuildCommandsBestEffort();
}

try {
  await main();
} catch (error) {
  console.error("[Bot] Failed to start:", error);
  process.exit(1);
}
