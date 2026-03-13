import {
  calculateBattlePower,
  getBaseStatsForLevel,
  sumStats,
} from "../domain/GameFormula.js";
import type {
  CatalogItem,
  EquipmentLoadout,
  GameRepository,
  PlayerComputedStats,
  PlayerProgress,
  StatBlock,
} from "../../types/index.js";

interface CatalogReader {
  getById(itemId: string): CatalogItem | null;
}

interface ProfileDeps {
  repository: Pick<
    GameRepository,
    "runInReadTransaction" | "ensurePlayer" | "getLoadout"
  >;
  catalog: CatalogReader;
}

interface EquippedItems {
  weapon: CatalogItem | null;
  armor: CatalogItem | null;
  accessory: CatalogItem | null;
}

export interface ProfileResult {
  player: PlayerProgress;
  loadout: EquipmentLoadout;
  equippedItems: EquippedItems;
  stats: PlayerComputedStats;
}

export function getProfile(
  deps: ProfileDeps,
  guildId: string,
  userId: string,
): ProfileResult {
  return deps.repository.runInReadTransaction(() =>
    buildProfileSnapshot(deps, guildId, userId),
  );
}

export function buildProfileSnapshot(
  deps: ProfileDeps,
  guildId: string,
  userId: string,
): ProfileResult {
  const player = deps.repository.ensurePlayer(guildId, userId);
  const loadout = deps.repository.getLoadout(guildId, userId);

  const equippedItems: EquippedItems = {
    weapon: loadout.weaponItemId
      ? deps.catalog.getById(loadout.weaponItemId)
      : null,
    armor: loadout.armorItemId
      ? deps.catalog.getById(loadout.armorItemId)
      : null,
    accessory: loadout.accessoryItemId
      ? deps.catalog.getById(loadout.accessoryItemId)
      : null,
  };

  const bonus = sumStats(
    [equippedItems.weapon, equippedItems.armor, equippedItems.accessory]
      .filter((item): item is CatalogItem => item !== null)
      .map(toStatBlock),
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
