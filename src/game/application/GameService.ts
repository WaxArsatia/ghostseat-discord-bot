import { randomUUID } from "node:crypto";
import { GameCatalog, rollRarity } from "../domain/GameCatalog.js";
import {
  applyExpGain,
  calculateBattlePower,
  getBaseStatsForLevel,
  simulateDuel,
  sumStats,
} from "../domain/GameFormula.js";
import type {
  CatalogItem,
  EquipSlot,
  EquipmentLoadout,
  GameRepository,
  LeaderboardEntry,
  MatchHistoryRecord,
  PlayerComputedStats,
  PlayerProgress,
  StatBlock,
} from "../../types/index.js";

const VOICE_INTERVAL_MS = 15 * 60 * 1000;
const VOICE_EXP_PER_INTERVAL = 10;
const DUEL_COOLDOWN_MS = 30 * 1000;

const slotToType: Record<EquipSlot, CatalogItem["type"]> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
};

const rarityWeight: Record<CatalogItem["rarity"], number> = {
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
};

export interface SpinOutcome {
  rarity: CatalogItem["rarity"];
  item: CatalogItem;
  isDuplicate: boolean;
  shardsGained: number;
}

export interface ProfileResult {
  player: PlayerProgress;
  loadout: EquipmentLoadout;
  equippedItems: {
    weapon: CatalogItem | null;
    armor: CatalogItem | null;
    accessory: CatalogItem | null;
  };
  stats: PlayerComputedStats;
}

export interface InventoryItemView {
  item: CatalogItem;
  equippedSlot: EquipSlot | null;
  acquiredAt: string;
}

export interface InventoryResult {
  player: PlayerProgress;
  loadout: EquipmentLoadout;
  items: InventoryItemView[];
}

export interface SpinResult {
  player: PlayerProgress;
  outcomes: SpinOutcome[];
  totalShardsGained: number;
}

export interface ConvertResult {
  player: PlayerProgress;
  shardsSpent: number;
  ticketsGained: number;
}

export interface DuelResult {
  matchId: string;
  playerA: PlayerProgress;
  playerB: PlayerProgress;
  statsA: PlayerComputedStats;
  statsB: PlayerComputedStats;
  estimatedWinChanceA: number;
  winnerUserId: string;
  roundCount: number;
  remainingHpA: number;
  remainingHpB: number;
  logs: string[];
}

export interface VoiceAccrualResult {
  awardedIntervals: number;
  ticketsGained: number;
  expGained: number;
  player: PlayerProgress;
}

export class GameUserError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "GameUserError";
  }
}

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly catalog: GameCatalog,
  ) {}

  initialize(): void {
    this.repository.initialize();
  }

  getCatalog(): GameCatalog {
    return this.catalog;
  }

  getProfile(guildId: string, userId: string): ProfileResult {
    return this.repository.runInTransaction(() =>
      this.buildProfileSnapshot(guildId, userId),
    );
  }

  getInventory(guildId: string, userId: string): InventoryResult {
    return this.repository.runInTransaction(() => {
      const player = this.repository.ensurePlayer(guildId, userId);
      const loadout = this.repository.getLoadout(guildId, userId);
      const ownerships = this.repository.listInventory(guildId, userId);

      const items = ownerships
        .map((ownership) => {
          const item = this.catalog.getById(ownership.itemId);
          if (!item) return null;

          return {
            item,
            acquiredAt: ownership.acquiredAt,
            equippedSlot: getEquippedSlot(loadout, ownership.itemId),
          } satisfies InventoryItemView;
        })
        .filter((entry): entry is InventoryItemView => entry !== null)
        .sort((a, b) => {
          const rarityDelta =
            rarityWeight[b.item.rarity] - rarityWeight[a.item.rarity];
          if (rarityDelta !== 0) return rarityDelta;
          const typeDelta = a.item.type.localeCompare(b.item.type);
          if (typeDelta !== 0) return typeDelta;
          return a.item.id.localeCompare(b.item.id);
        });

      return {
        player,
        loadout,
        items,
      };
    });
  }

  spin(guildId: string, userId: string, amount: number): SpinResult {
    if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
      throw new GameUserError(
        "Spin amount must be an integer between 1 and 10.",
      );
    }

    return this.repository.runInTransaction(() => {
      const player = this.repository.ensurePlayer(guildId, userId);
      if (player.tickets < amount) {
        throw new GameUserError(
          `Not enough tickets. You have ${player.tickets}, need ${amount}.`,
        );
      }

      const outcomes: SpinOutcome[] = [];
      let totalShardsGained = 0;

      for (let index = 0; index < amount; index += 1) {
        const rarity = rollRarity(
          player.pityEpicCounter,
          player.pityLegendaryCounter,
        );
        const item = this.catalog.pickRandomByRarity(rarity);
        const isNewOwnership = this.repository.addInventoryOwnership(
          guildId,
          userId,
          item.id,
          nowIso(),
        );

        const isDuplicate = !isNewOwnership;
        const shardsGained = isDuplicate
          ? this.catalog.getShardValue(item.rarity)
          : 0;

        if (isDuplicate) {
          player.shards += shardsGained;
          totalShardsGained += shardsGained;
        }

        player.tickets -= 1;

        if (rarity === "Legendary") {
          player.pityLegendaryCounter = 0;
          player.pityEpicCounter = 0;
        } else if (rarity === "Epic") {
          player.pityLegendaryCounter += 1;
          player.pityEpicCounter = 0;
        } else {
          player.pityLegendaryCounter += 1;
          player.pityEpicCounter += 1;
        }

        outcomes.push({
          rarity,
          item,
          isDuplicate,
          shardsGained,
        });
      }

      player.updatedAt = nowIso();
      this.repository.updatePlayer(player);

      return {
        player,
        outcomes,
        totalShardsGained,
      };
    });
  }

  equip(
    guildId: string,
    userId: string,
    slot: EquipSlot,
    itemId: string,
  ): ProfileResult {
    return this.repository.runInTransaction(() => {
      this.repository.ensurePlayer(guildId, userId);
      const ownerships = this.repository.listInventory(guildId, userId);
      const ownsItem = ownerships.some(
        (ownership) => ownership.itemId === itemId,
      );
      if (!ownsItem) {
        throw new GameUserError("You do not own that item.");
      }

      const item = this.catalog.getById(itemId);
      if (!item) {
        throw new GameUserError("Item is not present in the current catalog.");
      }

      const expectedType = slotToType[slot];
      if (item.type !== expectedType) {
        throw new GameUserError(
          `Slot ${slot} only accepts ${expectedType} items.`,
        );
      }

      this.repository.setLoadoutSlot(guildId, userId, slot, item.id);
      return this.buildProfileSnapshot(guildId, userId);
    });
  }

  unequip(guildId: string, userId: string, slot: EquipSlot): ProfileResult {
    return this.repository.runInTransaction(() => {
      this.repository.ensurePlayer(guildId, userId);
      this.repository.setLoadoutSlot(guildId, userId, slot, null);
      return this.buildProfileSnapshot(guildId, userId);
    });
  }

  convertShards(
    guildId: string,
    userId: string,
    shardAmount: number,
  ): ConvertResult {
    if (!Number.isInteger(shardAmount) || shardAmount <= 0) {
      throw new GameUserError("Shard amount must be a positive integer.");
    }

    if (shardAmount % 10 !== 0) {
      throw new GameUserError("Shard conversion requires multiples of 10.");
    }

    return this.repository.runInTransaction(() => {
      const player = this.repository.ensurePlayer(guildId, userId);
      if (player.shards < shardAmount) {
        throw new GameUserError(
          `Not enough shards. You have ${player.shards}, need ${shardAmount}.`,
        );
      }

      const ticketsGained = Math.floor(shardAmount / 10);
      player.shards -= shardAmount;
      player.tickets += ticketsGained;
      player.updatedAt = nowIso();
      this.repository.updatePlayer(player);

      return {
        player,
        shardsSpent: shardAmount,
        ticketsGained,
      };
    });
  }

  runDuel(
    guildId: string,
    challengerUserId: string,
    opponentUserId: string,
  ): DuelResult {
    if (challengerUserId === opponentUserId) {
      throw new GameUserError("You cannot duel yourself.");
    }

    return this.repository.runInTransaction(() => {
      const now = Date.now();
      const playerA = this.repository.ensurePlayer(guildId, challengerUserId);
      const playerB = this.repository.ensurePlayer(guildId, opponentUserId);

      assertDuelCooldown(playerA, now);
      assertDuelCooldown(playerB, now);

      const profileA = this.buildProfileSnapshot(guildId, challengerUserId);
      const profileB = this.buildProfileSnapshot(guildId, opponentUserId);

      const simulation = simulateDuel(
        {
          userId: challengerUserId,
          stats: profileA.stats.total,
          battlePower: profileA.stats.battlePower,
        },
        {
          userId: opponentUserId,
          stats: profileB.stats.total,
          battlePower: profileB.stats.battlePower,
        },
      );

      const logs = simulation.logs.map(
        (entry) =>
          `R${entry.round} • <@${entry.attackerUserId}> hits <@${entry.defenderUserId}> for **${entry.damage}** dmg (HP: ${entry.remainingHp})`,
      );

      const winnerIsA = simulation.winnerUserId === challengerUserId;
      const expGainA = winnerIsA ? 20 : 10;
      const expGainB = winnerIsA ? 10 : 20;

      const progressedA = applyExpGain(playerA.level, playerA.exp, expGainA);
      const progressedB = applyExpGain(playerB.level, playerB.exp, expGainB);

      playerA.level = progressedA.level;
      playerA.exp = progressedA.exp;
      playerA.lastDuelAtMs = now;
      playerA.updatedAt = nowIso();

      playerB.level = progressedB.level;
      playerB.exp = progressedB.exp;
      playerB.lastDuelAtMs = now;
      playerB.updatedAt = nowIso();

      this.repository.updatePlayer(playerA);
      this.repository.updatePlayer(playerB);

      const matchId = randomUUID();
      const historyRecord: MatchHistoryRecord = {
        matchId,
        guildId,
        playerAUserId: challengerUserId,
        playerBUserId: opponentUserId,
        battlePowerA: profileA.stats.battlePower,
        battlePowerB: profileB.stats.battlePower,
        estimatedWinChanceA: simulation.estimatedWinChanceA,
        roundCount: simulation.roundCount,
        remainingHpA: simulation.remainingHpA,
        remainingHpB: simulation.remainingHpB,
        battleLog: logs,
        winnerUserId: simulation.winnerUserId,
        createdAt: nowIso(),
      };
      this.repository.createMatchHistory(historyRecord);

      return {
        matchId,
        playerA,
        playerB,
        statsA: profileA.stats,
        statsB: profileB.stats,
        estimatedWinChanceA: simulation.estimatedWinChanceA,
        winnerUserId: simulation.winnerUserId,
        roundCount: simulation.roundCount,
        remainingHpA: simulation.remainingHpA,
        remainingHpB: simulation.remainingHpB,
        logs,
      };
    });
  }

  getDuelHistory(guildId: string, matchId: string): MatchHistoryRecord | null {
    return this.repository.getMatchHistory(guildId, matchId);
  }

  getLeaderboard(guildId: string, limit: number): LeaderboardEntry[] {
    return this.repository.getLeaderboard(guildId, limit);
  }

  applyVoiceEligibleElapsed(
    guildId: string,
    userId: string,
    elapsedMs: number,
  ): VoiceAccrualResult | null {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return null;
    }

    return this.repository.runInTransaction(() => {
      const player = this.repository.ensurePlayer(guildId, userId);
      const voiceProgress = this.repository.getVoiceProgress(guildId, userId);

      const eligibleTotal =
        Math.max(0, voiceProgress.eligibleMilliseconds) + Math.floor(elapsedMs);
      const awardedIntervals = Math.floor(eligibleTotal / VOICE_INTERVAL_MS);
      const remainder = eligibleTotal % VOICE_INTERVAL_MS;

      voiceProgress.eligibleMilliseconds = remainder;
      voiceProgress.lastTickAtMs = Date.now();
      voiceProgress.updatedAt = nowIso();
      this.repository.updateVoiceProgress(voiceProgress);

      if (awardedIntervals <= 0) {
        return null;
      }

      const expGained = awardedIntervals * VOICE_EXP_PER_INTERVAL;
      const progressed = applyExpGain(player.level, player.exp, expGained);

      player.level = progressed.level;
      player.exp = progressed.exp;
      player.tickets += awardedIntervals;
      player.updatedAt = nowIso();
      this.repository.updatePlayer(player);

      return {
        awardedIntervals,
        ticketsGained: awardedIntervals,
        expGained,
        player,
      };
    });
  }

  touchVoiceTick(guildId: string, userId: string, tickAtMs: number): void {
    this.repository.runInTransaction(() => {
      const voiceProgress = this.repository.getVoiceProgress(guildId, userId);
      voiceProgress.lastTickAtMs = tickAtMs;
      voiceProgress.updatedAt = nowIso();
      this.repository.updateVoiceProgress(voiceProgress);
    });
  }

  private buildProfileSnapshot(guildId: string, userId: string): ProfileResult {
    const player = this.repository.ensurePlayer(guildId, userId);
    const loadout = this.repository.getLoadout(guildId, userId);

    const equippedItems = {
      weapon: loadout.weaponItemId
        ? this.catalog.getById(loadout.weaponItemId)
        : null,
      armor: loadout.armorItemId
        ? this.catalog.getById(loadout.armorItemId)
        : null,
      accessory: loadout.accessoryItemId
        ? this.catalog.getById(loadout.accessoryItemId)
        : null,
    };

    const bonus = sumStats(
      [equippedItems.weapon, equippedItems.armor, equippedItems.accessory]
        .filter((item): item is CatalogItem => item !== null)
        .map((item) => toStatBlock(item)),
    );

    const base = getBaseStatsForLevel(player.level);
    const total = mergeStats(base, bonus);

    return {
      player,
      loadout,
      equippedItems,
      stats: {
        base,
        bonus,
        total,
        battlePower: calculateBattlePower(total),
      },
    };
  }
}

function mergeStats(base: StatBlock, bonus: StatBlock): StatBlock {
  return {
    atk: base.atk + bonus.atk,
    def: base.def + bonus.def,
    hp: Math.max(1, base.hp + bonus.hp),
    spd: Math.max(1, base.spd + bonus.spd),
  };
}

function toStatBlock(item: CatalogItem): StatBlock {
  return {
    atk: item.atk,
    def: item.def,
    hp: item.hp,
    spd: item.spd,
  };
}

function getEquippedSlot(
  loadout: EquipmentLoadout,
  itemId: string,
): EquipSlot | null {
  if (loadout.weaponItemId === itemId) return "weapon";
  if (loadout.armorItemId === itemId) return "armor";
  if (loadout.accessoryItemId === itemId) return "accessory";
  return null;
}

function assertDuelCooldown(player: PlayerProgress, now: number): void {
  const elapsed = now - player.lastDuelAtMs;
  if (elapsed >= DUEL_COOLDOWN_MS) return;

  const waitSeconds = Math.ceil((DUEL_COOLDOWN_MS - elapsed) / 1000);
  throw new GameUserError(
    `<@${player.userId}> is on duel cooldown for ${waitSeconds}s.`,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}
