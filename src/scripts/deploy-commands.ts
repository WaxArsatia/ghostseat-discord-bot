import { REST, Routes } from "discord.js";
import { config } from "../config/env.js";
import { commands } from "../commands/index.js";

const rest = new REST().setToken(config.token);
const commandData = [...commands.values()].map((command) =>
  command.data.toJSON(),
);

console.log(
  `[Deploy] Registering ${commandData.length} slash command(s) to guild ${config.guildId}...`,
);

try {
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    {
      body: commandData,
    },
  );
  console.log("[Deploy] Slash commands registered successfully.");
} catch (error) {
  console.error("[Deploy] Failed to register slash commands:", error);
  process.exit(1);
}
