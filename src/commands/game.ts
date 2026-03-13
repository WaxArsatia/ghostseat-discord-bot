import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { buildDuelLogPagePayload } from "../game/application/DuelLogPagination.js";
import {
  GameUserError,
  type InventoryItemView,
  type ProfileResult,
} from "../game/application/GameService.js";
import { gameService } from "../game/index.js";
import type { Command, EquipSlot } from "../types/index.js";

const INVENTORY_PAGE_SIZE = 10;

export const game: Command = {
  data: new SlashCommandBuilder()
    .setName("game")
    .setDescription("Voicebound Arena commands.")
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
        case "profile": {
          const profile = gameService.getProfile(guild.id, interaction.user.id);
          await interaction.reply({
            embeds: [buildProfileEmbed(profile, interaction.user.id)],
          });
          return;
        }

        case "spin": {
          await interaction.deferReply();
          const amount = interaction.options.getInteger("amount") ?? 1;
          const result = gameService.spin(
            guild.id,
            interaction.user.id,
            amount,
          );

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
          return;
        }

        case "inventory": {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const page = Math.max(1, interaction.options.getInteger("page") ?? 1);
          const inventory = gameService.getInventory(
            guild.id,
            interaction.user.id,
          );

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
          const pageItems = inventory.items.slice(
            start,
            start + INVENTORY_PAGE_SIZE,
          );

          const embed = new EmbedBuilder()
            .setTitle("🎒 Inventory")
            .setDescription(pageItems.map(formatInventoryItem).join("\n"))
            .setFooter({ text: `Page ${currentPage}/${totalPages}` });

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        case "equip": {
          const slot = interaction.options.getString("slot", true) as EquipSlot;
          const itemId = interaction.options.getString("item_id", true).trim();
          const profile = gameService.equip(
            guild.id,
            interaction.user.id,
            slot,
            itemId,
          );

          await interaction.reply({
            embeds: [
              buildProfileEmbed(profile, interaction.user.id).setTitle(
                `✅ Equipped ${slot}`,
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        case "unequip": {
          const slot = interaction.options.getString("slot", true) as EquipSlot;
          const profile = gameService.unequip(
            guild.id,
            interaction.user.id,
            slot,
          );

          await interaction.reply({
            embeds: [
              buildProfileEmbed(profile, interaction.user.id).setTitle(
                `🧹 Unequipped ${slot}`,
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        case "convert": {
          const amount = interaction.options.getInteger("amount", true);
          const result = gameService.convertShards(
            guild.id,
            interaction.user.id,
            amount,
          );

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
          return;
        }

        case "duel": {
          const opponent = interaction.options.getUser("user", true);
          if (opponent.bot) {
            await interaction.reply({
              content: "You can only duel human players.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.deferReply();
          const result = gameService.runDuel(
            guild.id,
            interaction.user.id,
            opponent.id,
          );

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
          return;
        }

        case "leaderboard": {
          const limit = interaction.options.getInteger("limit") ?? 10;
          const leaderboard = gameService.getLeaderboard(guild.id, limit);

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
  const message =
    error instanceof GameUserError
      ? error.userMessage
      : "An error occurred while processing this game command.";

  if (!(error instanceof GameUserError)) {
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
