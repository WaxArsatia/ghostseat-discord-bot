import { createGameVoiceTracker } from "./application/GameVoiceTracker.js";
import {
  convertShards,
  grantTickets,
  spin,
} from "./application/EconomyUseCase.js";
import {
  getDuelHistory,
  getLeaderboard,
  runDuel,
} from "./application/DuelUseCase.js";
import {
  applyVoiceEligibleElapsed,
  touchVoiceTick,
} from "./application/VoiceProgressUseCase.js";
import {
  equipItem,
  equipItemById,
  getInventory,
  unequipSlot,
} from "./application/InventoryLoadoutUseCase.js";
import { getProfile } from "./application/ProfileUseCase.js";
import { loadGameCatalog } from "./domain/GameCatalog.js";
import { createSQLiteGameRepository } from "./infrastructure/SQLiteGameRepository.js";
import type { EquipSlot } from "../types/index.js";

export function createGameRuntime() {
  const repository = createSQLiteGameRepository();
  const catalog = loadGameCatalog();
  const voiceProgress = {
    applyVoiceEligibleElapsed: (
      guildId: string,
      userId: string,
      elapsedMs: number,
    ) =>
      applyVoiceEligibleElapsed(
        {
          repository,
        },
        guildId,
        userId,
        elapsedMs,
      ),
    getLastVoiceTickAtMs: (guildId: string, userId: string) =>
      repository.runInReadTransaction(
        () => repository.getVoiceProgress(guildId, userId).lastTickAtMs,
      ),
    touchVoiceTick: (guildId: string, userId: string, tickAtMs: number) =>
      touchVoiceTick(
        {
          repository,
        },
        guildId,
        userId,
        tickAtMs,
      ),
  };
  const gameVoiceTracker = createGameVoiceTracker(voiceProgress);

  return {
    gameVoiceTracker,
    getProfile: (guildId: string, userId: string) =>
      getProfile(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
      ),
    getInventory: (guildId: string, userId: string) =>
      getInventory(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
      ),
    equipItem: (
      guildId: string,
      userId: string,
      slot: EquipSlot,
      itemId: string,
    ) =>
      equipItem(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
        slot,
        itemId,
      ),
    equipItemById: (guildId: string, userId: string, itemId: string) =>
      equipItemById(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
        itemId,
      ),
    unequipSlot: (guildId: string, userId: string, slot: EquipSlot) =>
      unequipSlot(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
        slot,
      ),
    spin: (guildId: string, userId: string, amount: number) =>
      spin(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
        amount,
      ),
    convertShards: (guildId: string, userId: string, shardAmount: number) =>
      convertShards(
        {
          repository,
          catalog,
        },
        guildId,
        userId,
        shardAmount,
      ),
    grantTickets: (guildId: string, userId: string, ticketAmount: number) =>
      grantTickets(
        {
          repository,
        },
        guildId,
        userId,
        ticketAmount,
      ),
    runDuel: (
      guildId: string,
      challengerUserId: string,
      opponentUserId: string,
    ) =>
      runDuel(
        {
          repository,
          catalog,
        },
        guildId,
        challengerUserId,
        opponentUserId,
      ),
    getDuelHistory: (guildId: string, matchId: string) =>
      getDuelHistory(
        {
          repository,
          catalog,
        },
        guildId,
        matchId,
      ),
    getLeaderboard: (guildId: string, limit: number) =>
      getLeaderboard(
        {
          repository,
          catalog,
        },
        guildId,
        limit,
      ),
    applyVoiceEligibleElapsed: voiceProgress.applyVoiceEligibleElapsed,
    touchVoiceTick: voiceProgress.touchVoiceTick,
    initializeStorage: () => {
      repository.initialize();
    },
    shutdown: () => {
      gameVoiceTracker.shutdown();
    },
  };
}

const gameRuntime = createGameRuntime();

export const gameVoiceTracker = gameRuntime.gameVoiceTracker;
export const getGameProfile = gameRuntime.getProfile;
export const getGameInventory = gameRuntime.getInventory;
export const equipGameItem = gameRuntime.equipItem;
export const equipGameItemById = gameRuntime.equipItemById;
export const unequipGameSlot = gameRuntime.unequipSlot;
export const spinGame = gameRuntime.spin;
export const convertGameShards = gameRuntime.convertShards;
export const grantGameTickets = gameRuntime.grantTickets;
export const runGameDuel = gameRuntime.runDuel;
export const getGameDuelHistory = gameRuntime.getDuelHistory;
export const getGameLeaderboard = gameRuntime.getLeaderboard;
export const applyGameVoiceEligibleElapsed =
  gameRuntime.applyVoiceEligibleElapsed;
export const touchGameVoiceTick = gameRuntime.touchVoiceTick;

export function initializeGameStorage(): void {
  gameRuntime.initializeStorage();
}

export function shutdownGameRuntime(): void {
  gameRuntime.shutdown();
}
