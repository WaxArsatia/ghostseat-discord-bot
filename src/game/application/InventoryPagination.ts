import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { InventoryItemView } from "./InventoryLoadoutUseCase.js";

const INVENTORY_PAGE_SIZE = 10;
const INVENTORY_PAGE_PREFIX = "game_inventory_page";
const INVENTORY_EQUIP_PREFIX = "game_inventory_equip";

export interface InventoryPageQuery {
  viewerUserId: string;
  page: number;
}

export interface InventoryPagePayload {
  embeds: EmbedBuilder[];
  components: Array<
    ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>
  >;
}

export function buildInventoryPageCustomId(
  viewerUserId: string,
  page: number,
): string {
  return `${INVENTORY_PAGE_PREFIX}:${viewerUserId}:${page}`;
}

export function parseInventoryPageCustomId(
  customId: string,
): InventoryPageQuery | null {
  const [prefix, viewerUserId, pageRaw] = customId.split(":");
  if (prefix !== INVENTORY_PAGE_PREFIX || !viewerUserId || !pageRaw) {
    return null;
  }

  const page = Number.parseInt(pageRaw, 10);
  if (!Number.isInteger(page)) {
    return null;
  }

  return {
    viewerUserId,
    page,
  };
}

export function buildInventoryEquipCustomId(
  viewerUserId: string,
  page: number,
): string {
  return `${INVENTORY_EQUIP_PREFIX}:${viewerUserId}:${page}`;
}

export function parseInventoryEquipCustomId(
  customId: string,
): InventoryPageQuery | null {
  const [prefix, viewerUserId, pageRaw] = customId.split(":");
  if (prefix !== INVENTORY_EQUIP_PREFIX || !viewerUserId || !pageRaw) {
    return null;
  }

  const page = Number.parseInt(pageRaw, 10);
  if (!Number.isInteger(page)) {
    return null;
  }

  return {
    viewerUserId,
    page,
  };
}

export function buildInventoryPagePayload(
  items: InventoryItemView[],
  query: InventoryPageQuery,
): InventoryPagePayload {
  const totalPages = Math.max(1, Math.ceil(items.length / INVENTORY_PAGE_SIZE));
  const currentPage = clampPage(query.page, totalPages);
  const start = currentPage * INVENTORY_PAGE_SIZE;
  const pageItems = items.slice(start, start + INVENTORY_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle("🎒 Inventory")
    .setDescription(
      pageItems.length > 0
        ? pageItems.map(formatInventoryItem).join("\n")
        : "You do not own any item yet. Use `/game spin` first.",
    )
    .setFooter({
      text: `Page ${currentPage + 1}/${totalPages}`,
    });

  const components: InventoryPagePayload["components"] = [];

  if (pageItems.length > 0) {
    const defaultItemId = pageItems.find((entry) => entry.equippedSlot !== null)
      ?.item.id;

    const equipSelect = new StringSelectMenuBuilder()
      .setCustomId(buildInventoryEquipCustomId(query.viewerUserId, currentPage))
      .setPlaceholder("Select an item to equip")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        pageItems.map((entry) => ({
          label: truncate(`[${entry.item.rarity}] ${entry.item.name}`, 100),
          value: entry.item.id,
          description: truncate(`${entry.item.type} • ${entry.item.id}`, 100),
          default: defaultItemId === entry.item.id,
        })),
      );

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        equipSelect,
      ),
    );
  }

  if (totalPages > 1) {
    const prevButton = new ButtonBuilder()
      .setCustomId(
        buildInventoryPageCustomId(query.viewerUserId, currentPage - 1),
      )
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0);

    const nextButton = new ButtonBuilder()
      .setCustomId(
        buildInventoryPageCustomId(query.viewerUserId, currentPage + 1),
      )
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1);

    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        prevButton,
        nextButton,
      ),
    );
  }

  return {
    embeds: [embed],
    components,
  };
}

function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  if (page < 0) {
    return 0;
  }

  if (page >= totalPages) {
    return totalPages - 1;
  }

  return page;
}

function formatInventoryItem(entry: InventoryItemView): string {
  const slotTag = entry.equippedSlot ? ` [equipped:${entry.equippedSlot}]` : "";
  return [
    `• [${entry.item.rarity}] ${entry.item.name} (${entry.item.id})${slotTag}`,
    `  ${entry.item.type} | ATK ${entry.item.atk >= 0 ? "+" : ""}${entry.item.atk} | DEF ${entry.item.def >= 0 ? "+" : ""}${entry.item.def} | HP ${entry.item.hp >= 0 ? "+" : ""}${entry.item.hp} | SPD ${entry.item.spd >= 0 ? "+" : ""}${entry.item.spd}`,
  ].join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
