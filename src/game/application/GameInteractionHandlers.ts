import {
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  buildDuelLogPagePayload,
  type DuelLogPageQuery,
  parseDuelLogCustomId,
} from "./DuelLogPagination.js";
import {
  buildInventoryPagePayload,
  type InventoryPageQuery,
  parseInventoryEquipCustomId,
  parseInventoryPageCustomId,
} from "./InventoryPagination.js";
import { isGameUserError } from "./GameErrors.js";
import {
  equipGameItemById,
  getGameDuelHistory,
  getGameInventory,
} from "../index.js";

export async function handleGameMessageComponentInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  if (interaction.isButton()) {
    const duelQuery = parseDuelLogCustomId(interaction.customId);
    if (duelQuery) {
      return handleDuelLogButtonInteraction(interaction, duelQuery);
    }

    const inventoryPageQuery = parseInventoryPageCustomId(interaction.customId);
    if (inventoryPageQuery) {
      return handleInventoryPageButtonInteraction(
        interaction,
        inventoryPageQuery,
      );
    }

    return false;
  }

  if (!interaction.isStringSelectMenu()) {
    return false;
  }

  const inventoryEquipQuery = parseInventoryEquipCustomId(interaction.customId);
  if (!inventoryEquipQuery) {
    return false;
  }

  if (interaction.user.id !== inventoryEquipQuery.viewerUserId) {
    await interaction.reply({
      content: "This inventory panel belongs to another player.",
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

  const selectedItemId = interaction.values[0]?.trim();
  if (!selectedItemId) {
    await interaction.reply({
      content: "Please select an item to equip.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  try {
    equipGameItemById(guild.id, interaction.user.id, selectedItemId);
  } catch (error) {
    const message = isGameUserError(error)
      ? error.userMessage
      : "Failed to equip the selected item.";

    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const inventory = getGameInventory(guild.id, interaction.user.id);
  const payload = buildInventoryPagePayload(
    inventory.items,
    inventoryEquipQuery,
  );
  await interaction.update(payload);
  return true;
}

async function handleDuelLogButtonInteraction(
  interaction: ButtonInteraction,
  query: DuelLogPageQuery,
): Promise<boolean> {
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

  const playerALabel = await resolveGuildUserLabel(
    interaction,
    history.playerAUserId,
  );
  const playerBLabel = await resolveGuildUserLabel(
    interaction,
    history.playerBUserId,
  );
  const formattedLogs = formatDuelLogsForUsers(history.battleLog, [
    {
      userId: history.playerAUserId,
      label: playerALabel,
    },
    {
      userId: history.playerBUserId,
      label: playerBLabel,
    },
  ]);

  const payload = buildDuelLogPagePayload(formattedLogs, query);
  await interaction.update(payload);
  return true;
}

async function handleInventoryPageButtonInteraction(
  interaction: ButtonInteraction,
  query: InventoryPageQuery,
): Promise<boolean> {
  if (interaction.user.id !== query.viewerUserId) {
    await interaction.reply({
      content: "This inventory panel belongs to another player.",
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

  const inventory = getGameInventory(guild.id, interaction.user.id);
  const payload = buildInventoryPagePayload(inventory.items, query);
  await interaction.update(payload);
  return true;
}

async function resolveGuildUserLabel(
  interaction: ButtonInteraction,
  userId: string,
): Promise<string> {
  const guild = interaction.guild;
  if (guild) {
    const cachedMember = guild.members.cache.get(userId);
    if (cachedMember) {
      return `${cachedMember.displayName} (${userId})`;
    }

    const fetchedMember = await guild.members.fetch(userId).catch(() => null);
    if (fetchedMember) {
      return `${fetchedMember.displayName} (${userId})`;
    }
  }

  const cachedUser = interaction.client.users.cache.get(userId);
  if (cachedUser) {
    const cachedName = cachedUser.globalName ?? cachedUser.username;
    return `${cachedName} (${userId})`;
  }

  const fetchedUser = await interaction.client.users
    .fetch(userId)
    .catch(() => null);
  if (fetchedUser) {
    const fetchedName = fetchedUser.globalName ?? fetchedUser.username;
    return `${fetchedName} (${userId})`;
  }

  return userId;
}

function formatDuelLogsForUsers(
  logs: string[],
  users: Array<{
    userId: string;
    label: string;
  }>,
): string[] {
  return logs.map((line) => {
    let formattedLine = line;
    for (const user of users) {
      formattedLine = formattedLine.replaceAll(`<@${user.userId}>`, user.label);
      formattedLine = formattedLine.replace(
        new RegExp(`\\b${escapeRegex(user.userId)}\\b`, "g"),
        user.label,
      );
    }
    return formattedLine;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
