import type {
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

type CommandData =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

export interface Command {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export type ItemType = "Weapon" | "Armor" | "Accessory";

export type ItemRarity = "Common" | "Rare" | "Epic" | "Legendary";

export type EquipSlot = "weapon" | "armor" | "accessory";

export interface CatalogItem {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export interface PlayerProgress {
  guildId: string;
  userId: string;
  level: number;
  exp: number;
  tickets: number;
  shards: number;
  pityEpicCounter: number;
  pityLegendaryCounter: number;
  lastDuelAtMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceProgress {
  guildId: string;
  userId: string;
  eligibleMilliseconds: number;
  lastTickAtMs: number;
  updatedAt: string;
}

export interface InventoryOwnership {
  guildId: string;
  userId: string;
  itemId: string;
  acquiredAt: string;
}

export interface EquipmentLoadout {
  guildId: string;
  userId: string;
  weaponItemId: string | null;
  armorItemId: string | null;
  accessoryItemId: string | null;
  updatedAt: string;
}

export interface StatBlock {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export interface PlayerComputedStats {
  base: StatBlock;
  bonus: StatBlock;
  total: StatBlock;
  battlePower: number;
}

export interface MatchHistoryRecord {
  matchId: string;
  guildId: string;
  playerAUserId: string;
  playerBUserId: string;
  battlePowerA: number;
  battlePowerB: number;
  estimatedWinChanceA: number;
  roundCount: number;
  remainingHpA: number;
  remainingHpB: number;
  battleLog: string[];
  winnerUserId: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  level: number;
  exp: number;
}

export interface PlayerInventorySnapshot {
  loadout: EquipmentLoadout;
  ownerships: InventoryOwnership[];
}

export interface GameRepository {
  initialize(): void;
  runInReadTransaction<T>(callback: () => T): T;
  runInWriteTransaction<T>(callback: () => T): T;
  ensurePlayer(guildId: string, userId: string): PlayerProgress;
  updatePlayer(player: PlayerProgress): void;

  getVoiceProgress(guildId: string, userId: string): VoiceProgress;
  updateVoiceProgress(voiceProgress: VoiceProgress): void;

  listInventory(guildId: string, userId: string): InventoryOwnership[];
  addInventoryOwnership(
    guildId: string,
    userId: string,
    itemId: string,
    acquiredAt: string,
  ): boolean;

  getLoadout(guildId: string, userId: string): EquipmentLoadout;
  setLoadoutSlot(
    guildId: string,
    userId: string,
    slot: EquipSlot,
    itemId: string | null,
  ): EquipmentLoadout;

  createMatchHistory(record: MatchHistoryRecord): void;
  getMatchHistory(guildId: string, matchId: string): MatchHistoryRecord | null;

  getLeaderboard(guildId: string, limit: number): LeaderboardEntry[];
}
