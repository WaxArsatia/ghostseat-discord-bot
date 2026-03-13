import { SlashCommandBuilder } from "discord.js";
import { leaveVoice } from "../services/VoiceService.js";
import type { Command } from "../types/index.js";

export const leave: Command = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Banish Ghostseat from the voice channel."),
  execute: async (interaction) => {
    await leaveVoice(interaction);
  },
};
