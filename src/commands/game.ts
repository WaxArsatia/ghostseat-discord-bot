import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildDuelLogPagePayload } from "../game/application/DuelLogPagination.js";
import { type InventoryItemView } from "../game/application/InventoryLoadoutUseCase.js";
import { isGameUserError } from "../game/application/GameErrors.js";
import type { ProfileResult } from "../game/application/ProfileUseCase.js";
import {
  convertGameShards,
  equipGameItem,
  grantGameTickets,
  getGameLeaderboard,
  runGameDuel,
  getGameInventory,
  getGameProfile,
  spinGame,
  unequipGameSlot,
} from "../game/index.js";
import type { Command, EquipSlot } from "../types/index.js";
import { isAdminUser } from "../config/admin.js";

const INVENTORY_PAGE_SIZE = 10;

export const game: Command = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Voicebound Arena commands.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("help")
        .setDescription("Show quick guide and gameplay loop."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("profile").setDescription("Show your game profile."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("spin")
        .setDescription("Spend tickets to roll equipment.")
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription("How many spins (1-10).")
            .setMinValue(1)
            .setMaxValue(10),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("inventory")
        .setDescription("Show owned equipment.")
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Inventory page number.")
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("equip")
        .setDescription("Equip an owned item to a slot.")
        .addStringOption((option) =>
          option
            .setName("slot")
            .setDescription("Loadout slot")
            .setRequired(true)
            .addChoices(
              { name: "weapon", value: "weapon" },
              { name: "armor", value: "armor" },
              { name: "accessory", value: "accessory" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("item_id")
            .setDescription("Item ID from your inventory")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unequip")
        .setDescription("Unequip one loadout slot.")
        .addStringOption((option) =>
          option
            .setName("slot")
            .setDescription("Loadout slot")
            .setRequired(true)
            .addChoices(
              { name: "weapon", value: "weapon" },
              { name: "armor", value: "armor" },
              { name: "accessory", value: "accessory" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("convert")
        .setDescription("Convert shards into tickets (10:1).")
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription("Shard amount (must be multiple of 10)")
            .setRequired(true)
            .setMinValue(10),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("duel")
        .setDescription("Run an automatic 1v1 duel.")
        .addUserOption((option) =>
          option.setName("user").setDescription("Opponent").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("leaderboard")
        .setDescription("Show game leaderboard (level, exp).")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("How many players to show (default 10, max 25)")
            .setMinValue(1)
            .setMaxValue(25),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("give")
        .setDescription("Admin resource tools.")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("ticket")
            .setDescription("Give tickets to a target player.")
            .addUserOption((option) =>
              option
                .setName("target")
                .setDescription("Target player")
                .setRequired(true),
            )
            .addIntegerOption((option) =>
              option
                .setName("amount")
                .setDescription("How many tickets to give")
                .setRequired(true)
                .setMinValue(1),
            ),
        ),
    ),
  execute: async (interaction) => {
    try {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({
          content: "This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "help": {
          await handleHelpSubcommand(interaction);
          return;
        }

        case "profile": {
          await handleProfileSubcommand(interaction, guild.id);
          return;
        }

        case "spin": {
          await handleSpinSubcommand(interaction, guild.id);
          return;
        }

        case "inventory": {
          await handleInventorySubcommand(interaction, guild.id);
          return;
        }

        case "equip": {
          await handleEquipSubcommand(interaction, guild.id);
          return;
        }

        case "unequip": {
          await handleUnequipSubcommand(interaction, guild.id);
          return;
        }

        case "convert": {
          await handleConvertSubcommand(interaction, guild.id);
          return;
        }

        case "duel": {
          await handleDuelSubcommand(interaction, guild.id);
          return;
        }

        case "leaderboard": {
          await handleLeaderboardSubcommand(interaction, guild.id);
          return;
        }

        case "ticket": {
          await handleGiveTicketSubcommand(interaction, guild.id);
          return;
        }

        default: {
          await interaction.reply({
            content: "Unknown game subcommand.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } catch (error) {
      await replyWithGameError(interaction, error);
    }
  },
};

async function handleHelpSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("📘 Voicebound Arena Help")
        .setDescription(
          [
            "Core loop: **Voice chat → tickets/EXP → spin gear → equip loadout → duel**.",
            "Use this as a quick start for new players.",
          ].join("\n"),
        )
        .addFields(
          {
            name: "How to Play",
            value: [
              "1. Stay in a non-AFK voice channel: **+1 ticket** and **+10 EXP** every 15 minutes.",
              "2. Roll equipment with `/game spin [amount]` (1-10).",
              "3. Manage loadout with `/game inventory`, `/game equip`, and `/game unequip`.",
              "4. Duel with `/game duel @user` (winner +20 EXP, loser +10 EXP).",
              "5. Convert extras with `/game convert [amount]` (**10 shards = 1 ticket**).",
            ].join("\n"),
          },
          {
            name: "Useful Commands",
            value: [
              "`/game profile` — View progress, stats, and equipped items",
              "`/game leaderboard [limit]` — Top players by level, then EXP",
            ].join("\n"),
          },
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleProfileSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const profile = getGameProfile(guildId, interaction.user.id);
  await interaction.reply({
    embeds: [buildProfileEmbed(profile, interaction.user.id)],
  });
}

async function handleSpinSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  await interaction.deferReply();
  const amount = interaction.options.getInteger("amount") ?? 1;
  const result = spinGame(guildId, interaction.user.id, amount);

  const lines = result.outcomes.map((entry, index) => {
    const duplicateNote = entry.isDuplicate
      ? ` (duplicate, +${entry.shardsGained} shards)`
      : "";
    return `${index + 1}. [${entry.rarity}] ${entry.item.name} (${entry.item.id})${duplicateNote}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🎰 Spin Result")
    .setDescription(lines.join("\n"))
    .addFields(
      {
        name: "Resources",
        value: `Tickets: **${result.player.tickets}**\nShards: **${result.player.shards}**`,
        inline: true,
      },
      {
        name: "Duplicate Shards",
        value: `+${result.totalShardsGained}`,
        inline: true,
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleInventorySubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const page = Math.max(1, interaction.options.getInteger("page") ?? 1);
  const inventory = getGameInventory(guildId, interaction.user.id);

  if (inventory.items.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎒 Inventory")
          .setDescription(
            "You do not own any item yet. Use `/game spin` first.",
          ),
      ],
    });
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(inventory.items.length / INVENTORY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * INVENTORY_PAGE_SIZE;
  const pageItems = inventory.items.slice(start, start + INVENTORY_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle("🎒 Inventory")
    .setDescription(pageItems.map(formatInventoryItem).join("\n"))
    .setFooter({ text: `Page ${currentPage}/${totalPages}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleEquipSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const slot = interaction.options.getString("slot", true) as EquipSlot;
  const itemId = interaction.options.getString("item_id", true).trim();
  const profile = equipGameItem(guildId, interaction.user.id, slot, itemId);

  await interaction.reply({
    embeds: [
      buildProfileEmbed(profile, interaction.user.id).setTitle(
        `✅ Equipped ${slot}`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUnequipSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const slot = interaction.options.getString("slot", true) as EquipSlot;
  const profile = unequipGameSlot(guildId, interaction.user.id, slot);

  await interaction.reply({
    embeds: [
      buildProfileEmbed(profile, interaction.user.id).setTitle(
        `🧹 Unequipped ${slot}`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConvertSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const amount = interaction.options.getInteger("amount", true);
  const result = convertGameShards(guildId, interaction.user.id, amount);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🔁 Shard Conversion")
        .setDescription(
          `Converted **${result.shardsSpent}** shards into **${result.ticketsGained}** tickets.`,
        )
        .addFields({
          name: "Resources",
          value: `Tickets: **${result.player.tickets}**\nShards: **${result.player.shards}**`,
        }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDuelSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const opponent = interaction.options.getUser("user", true);
  if (opponent.bot) {
    await interaction.reply({
      content: "You can only duel human players.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  const result = runGameDuel(guildId, interaction.user.id, opponent.id);

  const summaryEmbed = new EmbedBuilder()
    .setTitle("⚔️ Duel Result")
    .setDescription(
      [
        `<@${interaction.user.id}> vs <@${opponent.id}>`,
        `Estimated win chance for <@${interaction.user.id}>: **${Math.round(result.estimatedWinChanceA * 100)}%**`,
        `Winner: <@${result.winnerUserId}>`,
        `Rounds: **${result.roundCount}**`,
      ].join("\n"),
    )
    .addFields(
      {
        name: `<@${interaction.user.id}>`,
        value: `BP: **${result.statsA.battlePower}**\nFinal HP: **${result.remainingHpA}**`,
        inline: true,
      },
      {
        name: `<@${opponent.id}>`,
        value: `BP: **${result.statsB.battlePower}**\nFinal HP: **${result.remainingHpB}**`,
        inline: true,
      },
    );

  await interaction.editReply({ embeds: [summaryEmbed] });

  const payload = buildDuelLogPagePayload(result.logs, {
    matchId: result.matchId,
    viewerUserId: interaction.user.id,
    page: 0,
  });

  await interaction.followUp({
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleLeaderboardSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const limit = interaction.options.getInteger("limit") ?? 10;
  const leaderboard = getGameLeaderboard(guildId, limit);

  if (leaderboard.length === 0) {
    await interaction.reply({
      content: "No game progress recorded yet in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines = leaderboard.map(
    (entry, index) =>
      `${index + 1}. <@${entry.userId}> — Lv **${entry.level}** (EXP ${entry.exp})`,
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 Voicebound Arena Leaderboard")
        .setDescription(lines.join("\n")),
    ],
  });
}

async function handleGiveTicketSubcommand(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  if (group !== "give") {
    await interaction.reply({
      content: "Unknown game subcommand group.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isAdminUser(interaction.user.id)) {
    await interaction.reply({
      content: "You are not allowed to use this admin command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("target", true);
  const amount = interaction.options.getInteger("amount", true);
  const result = grantGameTickets(guildId, target.id, amount);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎟️ Ticket Grant")
        .setDescription(
          `Gave **${result.ticketsGiven}** tickets to <@${target.id}>.`,
        )
        .addFields({
          name: "Target Resources",
          value: `Tickets: **${result.player.tickets}**\nShards: **${result.player.shards}**`,
        }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

function buildProfileEmbed(
  profile: ProfileResult,
  userId: string,
): EmbedBuilder {
  const weapon = profile.equippedItems.weapon;
  const armor = profile.equippedItems.armor;
  const accessory = profile.equippedItems.accessory;

  return new EmbedBuilder()
    .setTitle("🧙 Voicebound Profile")
    .setDescription(`<@${userId}>`)
    .addFields(
      {
        name: "Progress",
        value: [
          `Level: **${profile.player.level}**`,
          `EXP: **${profile.player.exp}**`,
          `Tickets: **${profile.player.tickets}**`,
          `Shards: **${profile.player.shards}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Total Stats",
        value: [
          `ATK: **${profile.stats.total.atk}**`,
          `DEF: **${profile.stats.total.def}**`,
          `HP: **${profile.stats.total.hp}**`,
          `SPD: **${profile.stats.total.spd}**`,
          `BP: **${profile.stats.battlePower}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "Loadout",
        value: [
          `Weapon: ${formatLoadoutEntry(weapon)}`,
          `Armor: ${formatLoadoutEntry(armor)}`,
          `Accessory: ${formatLoadoutEntry(accessory)}`,
        ].join("\n"),
      },
    );
}

function formatLoadoutEntry(
  item: ProfileResult["equippedItems"]["weapon"],
): string {
  if (!item) {
    return "-";
  }

  return `${item.name} (${item.id})`;
}

function formatInventoryItem(entry: InventoryItemView): string {
  const slotTag = entry.equippedSlot ? ` [equipped:${entry.equippedSlot}]` : "";
  return [
    `• [${entry.item.rarity}] ${entry.item.name} (${entry.item.id})${slotTag}`,
    `  ${entry.item.type} | ATK ${entry.item.atk >= 0 ? "+" : ""}${entry.item.atk} | DEF ${entry.item.def >= 0 ? "+" : ""}${entry.item.def} | HP ${entry.item.hp >= 0 ? "+" : ""}${entry.item.hp} | SPD ${entry.item.spd >= 0 ? "+" : ""}${entry.item.spd}`,
  ].join("\n");
}

async function replyWithGameError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const userError = isGameUserError(error);
  const message = userError
    ? error.userMessage
    : "An error occurred while processing this game command.";

  if (!userError) {
    console.error("[GameCommand] Unhandled error:", error);
  }

  if (interaction.deferred) {
    await interaction.editReply({ content: message, embeds: [] });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}
