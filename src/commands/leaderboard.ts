import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/index.js";
import { voiceLeaderboardService } from "../services/VoiceLeaderboardService.js";

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show top voice-active members in this server.")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("How many members to show (default 10, max 25).")
        .setMinValue(1)
        .setMaxValue(25),
    ),
  execute: async (interaction) => {
    await voiceLeaderboardService.showLeaderboard(interaction);
  },
};
