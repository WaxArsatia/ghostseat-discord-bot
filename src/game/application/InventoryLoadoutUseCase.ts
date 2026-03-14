import { createGameUserError } from "./GameErrors.js";
import { buildProfileSnapshot, type ProfileResult } from "./ProfileUseCase.js";
import type {
  CatalogItem,
  EquipSlot,
  GameRepository,
  PlayerProgress,
} from "../../types/index.js";

interface CatalogReader {
  getById(itemId: string): CatalogItem | null;
}

interface InventoryLoadoutDeps {
  repository: Pick<
    GameRepository,
    | "runInReadTransaction"
    | "runInWriteTransaction"
    | "ensurePlayer"
    | "getLoadout"
    | "listInventory"
    | "setLoadoutSlot"
  >;
  catalog: CatalogReader;
}

const slotToType: Record<EquipSlot, CatalogItem["type"]> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
};

const typeToSlot: Record<CatalogItem["type"], EquipSlot> = {
  Weapon: "weapon",
  Armor: "armor",
  Accessory: "accessory",
};

const rarityWeight: Record<CatalogItem["rarity"], number> = {
  Common: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
};

export interface InventoryItemView {
  item: CatalogItem;
  equippedSlot: EquipSlot | null;
  acquiredAt: string;
}

export interface InventoryResult {
  player: PlayerProgress;
  loadout: ReturnType<InventoryLoadoutDeps["repository"]["getLoadout"]>;
  items: InventoryItemView[];
}

export interface EquipByItemIdResult {
  profile: ProfileResult;
  slot: EquipSlot;
  item: CatalogItem;
}

export function getInventory(
  deps: InventoryLoadoutDeps,
  guildId: string,
  userId: string,
): InventoryResult {
  return deps.repository.runInReadTransaction(() => {
    const player = deps.repository.ensurePlayer(guildId, userId);
    const loadout = deps.repository.getLoadout(guildId, userId);
    const ownerships = deps.repository.listInventory(guildId, userId);

    const items = ownerships
      .map((ownership) => {
        const item = deps.catalog.getById(ownership.itemId);
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

export function equipItem(
  deps: InventoryLoadoutDeps,
  guildId: string,
  userId: string,
  slot: EquipSlot,
  itemId: string,
): ProfileResult {
  return deps.repository.runInWriteTransaction(() => {
    deps.repository.ensurePlayer(guildId, userId);
    const item = assertOwnedCatalogItem(deps, guildId, userId, itemId);

    const expectedType = slotToType[slot];
    if (item.type !== expectedType) {
      throw createGameUserError(
        `Slot ${slot} only accepts ${expectedType} items.`,
      );
    }

    deps.repository.setLoadoutSlot(guildId, userId, slot, item.id);
    return buildProfileSnapshot(
      {
        repository: deps.repository,
        catalog: deps.catalog,
      },
      guildId,
      userId,
    );
  });
}

export function equipItemById(
  deps: InventoryLoadoutDeps,
  guildId: string,
  userId: string,
  itemId: string,
): EquipByItemIdResult {
  return deps.repository.runInWriteTransaction(() => {
    deps.repository.ensurePlayer(guildId, userId);
    const item = assertOwnedCatalogItem(deps, guildId, userId, itemId);
    const slot = typeToSlot[item.type];

    deps.repository.setLoadoutSlot(guildId, userId, slot, item.id);
    const profile = buildProfileSnapshot(
      {
        repository: deps.repository,
        catalog: deps.catalog,
      },
      guildId,
      userId,
    );

    return {
      profile,
      slot,
      item,
    };
  });
}

export function unequipSlot(
  deps: InventoryLoadoutDeps,
  guildId: string,
  userId: string,
  slot: EquipSlot,
): ProfileResult {
  return deps.repository.runInWriteTransaction(() => {
    deps.repository.ensurePlayer(guildId, userId);
    deps.repository.setLoadoutSlot(guildId, userId, slot, null);

    return buildProfileSnapshot(
      {
        repository: deps.repository,
        catalog: deps.catalog,
      },
      guildId,
      userId,
    );
  });
}

function getEquippedSlot(
  loadout: ReturnType<InventoryLoadoutDeps["repository"]["getLoadout"]>,
  itemId: string,
): EquipSlot | null {
  if (loadout.weaponItemId === itemId) return "weapon";
  if (loadout.armorItemId === itemId) return "armor";
  if (loadout.accessoryItemId === itemId) return "accessory";
  return null;
}

function assertOwnedCatalogItem(
  deps: InventoryLoadoutDeps,
  guildId: string,
  userId: string,
  itemId: string,
): CatalogItem {
  const ownerships = deps.repository.listInventory(guildId, userId);
  const ownsItem = ownerships.some((ownership) => ownership.itemId === itemId);
  if (!ownsItem) {
    throw createGameUserError("You do not own that item.");
  }

  const item = deps.catalog.getById(itemId);
  if (!item) {
    throw createGameUserError("Item is not present in the current catalog.");
  }

  return item;
}
