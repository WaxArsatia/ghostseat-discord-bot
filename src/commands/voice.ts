import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { joinVoice, leaveVoice } from "../services/VoiceService.js";
import type { Command } from "../types/index.js";

export const voice: Command = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice channel commands.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("join")
        .setDescription("Summon Ghostseat into your current voice channel."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("Banish Ghostseat from the voice channel."),
    ),
  execute: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "join": {
        await joinVoice(interaction);
        break;
      }
      case "leave": {
        await leaveVoice(interaction);
        break;
      }
      default: {
        await interaction.reply({
          content: "Unknown voice subcommand.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
