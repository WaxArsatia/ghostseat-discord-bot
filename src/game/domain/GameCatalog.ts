import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogItem, ItemRarity } from "../../types/index.js";

interface CatalogFile {
  items: CatalogItem[];
}

const CATALOG_PATH = resolve(process.cwd(), "assets/game/item-catalog.json");

const shardByRarity: Record<ItemRarity, number> = {
  Common: 1,
  Rare: 3,
  Epic: 10,
  Legendary: 25,
};

export interface GameCatalog {
  getById(itemId: string): CatalogItem | null;
  pickRandomByRarity(rarity: ItemRarity): CatalogItem;
  getShardValue(rarity: ItemRarity): number;
  getManyById(itemIds: string[]): CatalogItem[];
}

export function createGameCatalog(items: CatalogItem[]): GameCatalog {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByRarity: Record<ItemRarity, CatalogItem[]> = {
    Common: [],
    Rare: [],
    Epic: [],
    Legendary: [],
  };

  for (const item of items) {
    itemsByRarity[item.rarity].push(item);
  }

  for (const rarity of Object.keys(itemsByRarity) as ItemRarity[]) {
    if (itemsByRarity[rarity].length === 0) {
      throw new Error(`[GameCatalog] Missing item pool for rarity: ${rarity}`);
    }
  }

  const getById = (itemId: string): CatalogItem | null => {
    return itemsById.get(itemId) ?? null;
  };

  const pickRandomByRarity = (rarity: ItemRarity): CatalogItem => {
    const pool = itemsByRarity[rarity];
    const index = Math.floor(Math.random() * pool.length);
    return pool[index] as CatalogItem;
  };

  const getShardValue = (rarity: ItemRarity): number => {
    return shardByRarity[rarity];
  };

  const getManyById = (itemIds: string[]): CatalogItem[] => {
    return itemIds
      .map((itemId) => getById(itemId))
      .filter((item): item is CatalogItem => item !== null);
  };

  return {
    getById,
    pickRandomByRarity,
    getShardValue,
    getManyById,
  };
}

export function loadGameCatalog(): GameCatalog {
  const raw = readFileSync(CATALOG_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<CatalogFile>;

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("[GameCatalog] item catalog is empty or invalid");
  }

  return createGameCatalog(parsed.items);
}

export function rollRarity(
  pityEpicCounter: number,
  pityLegendaryCounter: number,
): ItemRarity {
  if (pityLegendaryCounter >= 36) {
    return "Legendary";
  }

  if (pityEpicCounter >= 12) {
    const boostedRoll = Math.random();
    return boostedRoll < 0.125 ? "Legendary" : "Epic";
  }

  const roll = Math.random();
  if (roll < 0.01) return "Legendary";
  if (roll < 0.08) return "Epic";
  if (roll < 0.3) return "Rare";
  return "Common";
}
