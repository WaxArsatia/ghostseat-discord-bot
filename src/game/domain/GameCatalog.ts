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

export class GameCatalog {
  private readonly itemsById: Map<string, CatalogItem>;
  private readonly itemsByRarity: Record<ItemRarity, CatalogItem[]>;

  constructor(items: CatalogItem[]) {
    this.itemsById = new Map(items.map((item) => [item.id, item]));
    this.itemsByRarity = {
      Common: [],
      Rare: [],
      Epic: [],
      Legendary: [],
    };

    for (const item of items) {
      this.itemsByRarity[item.rarity].push(item);
    }

    for (const rarity of Object.keys(this.itemsByRarity) as ItemRarity[]) {
      if (this.itemsByRarity[rarity].length === 0) {
        throw new Error(
          `[GameCatalog] Missing item pool for rarity: ${rarity}`,
        );
      }
    }
  }

  static load(): GameCatalog {
    const raw = readFileSync(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CatalogFile>;

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new Error("[GameCatalog] item catalog is empty or invalid");
    }

    return new GameCatalog(parsed.items);
  }

  getById(itemId: string): CatalogItem | null {
    return this.itemsById.get(itemId) ?? null;
  }

  pickRandomByRarity(rarity: ItemRarity): CatalogItem {
    const pool = this.itemsByRarity[rarity];
    const index = Math.floor(Math.random() * pool.length);
    return pool[index] as CatalogItem;
  }

  getShardValue(rarity: ItemRarity): number {
    return shardByRarity[rarity];
  }

  getManyById(itemIds: string[]): CatalogItem[] {
    return itemIds
      .map((itemId) => this.getById(itemId))
      .filter((item): item is CatalogItem => item !== null);
  }
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
