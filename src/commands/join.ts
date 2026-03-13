import { SlashCommandBuilder } from "discord.js";
import { joinVoice } from "../services/VoiceService.js";
import type { Command } from "../types/index.js";

export const join: Command = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription(
      "Summon Ghostseat into your voice channel. It will haunt the seat until /leave.",
    ),
  execute: async (interaction) => {
    await joinVoice(interaction);
  },
};
