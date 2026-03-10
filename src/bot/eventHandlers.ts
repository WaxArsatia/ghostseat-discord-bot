import { Events } from "discord.js";
import { client } from "./client.js";
import { commands } from "../commands/index.js";

export function registerEventHandlers(): void {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`[Bot] Ready! Logged in as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `[Bot] Error executing /${interaction.commandName}:`,
        error,
      );

      const errorReply = {
        content: "An error occurred while executing this command.",
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
  });
}
