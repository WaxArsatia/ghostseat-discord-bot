import { REST, Routes } from "discord.js";
import { commands } from "../commands/index.js";
import { config } from "../config/env.js";

export async function deployGuildCommands(): Promise<void> {
  const rest = new REST().setToken(config.token);
  const commandData = [...commands.values()].map((command) =>
    command.data.toJSON(),
  );

  console.log(
    `[Deploy] Registering ${commandData.length} slash command(s) to guild ${config.guildId}...`,
  );

  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    {
      body: commandData,
    },
  );

  console.log("[Deploy] Slash commands registered successfully.");
}
