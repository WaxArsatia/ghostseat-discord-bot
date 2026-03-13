import { MessageFlags, type ButtonInteraction } from "discord.js";
import {
  buildDuelLogPagePayload,
  parseDuelLogCustomId,
} from "./DuelLogPagination.js";
import { getGameDuelHistory } from "../index.js";

export async function handleGameButtonInteraction(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const query = parseDuelLogCustomId(interaction.customId);
  if (!query) {
    return false;
  }

  if (interaction.user.id !== query.viewerUserId) {
    await interaction.reply({
      content: "This duel log belongs to another player.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This interaction can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const history = getGameDuelHistory(guild.id, query.matchId);
  if (!history) {
    await interaction.reply({
      content: "Duel log not found or has expired.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const payload = buildDuelLogPagePayload(history.battleLog, query);
  await interaction.update(payload);
  return true;
}
