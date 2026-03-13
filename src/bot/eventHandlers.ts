import { Events, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { client } from "./client.js";
import { commands } from "../commands/index.js";
import {
  handleVoiceLeaderboardVoiceStateUpdate,
  initializeVoiceLeaderboardFromClient,
} from "../services/VoiceLeaderboardService.js";

async function replyWithCommandError(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const payload = {
    content: "An error occurred while executing this command.",
    flags: MessageFlags.Ephemeral,
  } as const;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  } catch (error) {
    console.error("[Bot] Failed to send command error response:", error);
  }
}

export function registerEventHandlers(): void {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`[Bot] Ready! Logged in as ${readyClient.user.tag}`);

    try {
      initializeVoiceLeaderboardFromClient(client);
    } catch (error) {
      console.error(
        "[Bot] Failed to initialize voice leaderboard state:",
        error,
      );
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
      handleVoiceLeaderboardVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error("[Bot] VoiceStateUpdate handler failed:", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        content: "This command is not available right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `[Bot] Error executing /${interaction.commandName}:`,
        error,
      );

      await replyWithCommandError(interaction);
    }
  });
}
