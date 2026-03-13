import { SlashCommandBuilder } from "discord.js";
import { joinVoice, leaveVoice } from "../services/VoiceService.js";
import { showVoiceLeaderboard } from "../services/VoiceLeaderboardService.js";
import type { Command } from "../types/index.js";

export const voice: Command = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Voice channel commands.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("join")
        .setDescription("Summon Ghostseat into your current voice channel."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leave")
        .setDescription("Banish Ghostseat from the voice channel."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show top voice-active members in this server.")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("How many members to show (default 10, max 25).")
            .setMinValue(1)
            .setMaxValue(25),
        ),
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
      case "leaderboard": {
        await showVoiceLeaderboard(interaction);
        break;
      }
      default: {
        await interaction.reply({
          content: "Unknown voice subcommand.",
        });
      }
    }
  },
};
