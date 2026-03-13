import { rollRarity } from "../domain/GameCatalog.js";
import { createGameUserError } from "./GameErrors.js";
import type {
  CatalogItem,
  GameRepository,
  PlayerProgress,
} from "../../types/index.js";

export const SPIN_MIN_AMOUNT = 1;
export const SPIN_MAX_AMOUNT = 10;
export const SHARDS_PER_TICKET = 10;

interface CatalogEconomyDeps {
  pickRandomByRarity(rarity: CatalogItem["rarity"]): CatalogItem;
  getShardValue(rarity: CatalogItem["rarity"]): number;
}

interface EconomyDeps {
  repository: Pick<
    GameRepository,
    | "runInTransaction"
    | "ensurePlayer"
    | "addInventoryOwnership"
    | "updatePlayer"
  >;
  catalog: CatalogEconomyDeps;
  nowIso?: () => string;
}

export interface SpinOutcome {
  rarity: CatalogItem["rarity"];
  item: CatalogItem;
  isDuplicate: boolean;
  shardsGained: number;
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

export function spin(
  deps: EconomyDeps,
  guildId: string,
  userId: string,
  amount: number,
): SpinResult {
  if (
    !Number.isInteger(amount) ||
    amount < SPIN_MIN_AMOUNT ||
    amount > SPIN_MAX_AMOUNT
  ) {
    throw createGameUserError(
      `Spin amount must be an integer between ${SPIN_MIN_AMOUNT} and ${SPIN_MAX_AMOUNT}.`,
    );
  }

  const nowIso = deps.nowIso ?? defaultNowIso;

  return deps.repository.runInTransaction(() => {
    const player = deps.repository.ensurePlayer(guildId, userId);
    if (player.tickets < amount) {
      throw createGameUserError(
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
      const item = deps.catalog.pickRandomByRarity(rarity);
      const isNewOwnership = deps.repository.addInventoryOwnership(
        guildId,
        userId,
        item.id,
        nowIso(),
      );

      const isDuplicate = !isNewOwnership;
      const shardsGained = isDuplicate
        ? deps.catalog.getShardValue(item.rarity)
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
    deps.repository.updatePlayer(player);

    return {
      player,
      outcomes,
      totalShardsGained,
    };
  });
}

export function convertShards(
  deps: EconomyDeps,
  guildId: string,
  userId: string,
  shardAmount: number,
): ConvertResult {
  if (!Number.isInteger(shardAmount) || shardAmount <= 0) {
    throw createGameUserError("Shard amount must be a positive integer.");
  }

  if (shardAmount % SHARDS_PER_TICKET !== 0) {
    throw createGameUserError(
      `Shard conversion requires multiples of ${SHARDS_PER_TICKET}.`,
    );
  }

  const nowIso = deps.nowIso ?? defaultNowIso;

  return deps.repository.runInTransaction(() => {
    const player = deps.repository.ensurePlayer(guildId, userId);
    if (player.shards < shardAmount) {
      throw createGameUserError(
        `Not enough shards. You have ${player.shards}, need ${shardAmount}.`,
      );
    }

    const ticketsGained = Math.floor(shardAmount / SHARDS_PER_TICKET);
    player.shards -= shardAmount;
    player.tickets += ticketsGained;
    player.updatedAt = nowIso();
    deps.repository.updatePlayer(player);

    return {
      player,
      shardsSpent: shardAmount,
      ticketsGained,
    };
  });
}

function defaultNowIso(): string {
  return new Date().toISOString();
}
