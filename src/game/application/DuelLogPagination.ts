import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbed,
  type ButtonInteraction,
} from "discord.js";

export const DUEL_LOG_PAGE_SIZE = 8;
const CUSTOM_ID_PREFIX = "game_duel_log";

export interface DuelLogPageQuery {
  matchId: string;
  viewerUserId: string;
  page: number;
}

export interface DuelLogPagePayload {
  embeds: [EmbedBuilder];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function buildDuelLogCustomId(
  matchId: string,
  viewerUserId: string,
  page: number,
): string {
  return `${CUSTOM_ID_PREFIX}:${matchId}:${viewerUserId}:${page}`;
}

export function parseDuelLogCustomId(customId: string): DuelLogPageQuery | null {
  const [prefix, matchId, viewerUserId, pageRaw] = customId.split(":");
  if (prefix !== CUSTOM_ID_PREFIX) return null;
  if (!matchId || !viewerUserId || !pageRaw) return null;

  const page = Number.parseInt(pageRaw, 10);
  if (!Number.isInteger(page) || page < 0) return null;

  return {
    matchId,
    viewerUserId,
    page,
  };
}

export function buildDuelLogPagePayload(
  logs: string[],
  query: DuelLogPageQuery,
): DuelLogPagePayload {
  const totalPages = Math.max(1, Math.ceil(logs.length / DUEL_LOG_PAGE_SIZE));
  const currentPage = clampPage(query.page, totalPages);
  const start = currentPage * DUEL_LOG_PAGE_SIZE;
  const pageLogs = logs.slice(start, start + DUEL_LOG_PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setTitle("Duel Log")
    .setDescription(pageLogs.length > 0 ? pageLogs.join("\n") : "No logs recorded.")
    .setFooter({
      text: `Match ${query.matchId} • Page ${currentPage + 1}/${totalPages}`,
    });

  if (totalPages <= 1) {
    return {
      embeds: [embed],
      components: [],
    };
  }

  const prevButton = new ButtonBuilder()
    .setCustomId(
      buildDuelLogCustomId(query.matchId, query.viewerUserId, currentPage - 1),
    )
    .setLabel("Prev")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage <= 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(
      buildDuelLogCustomId(query.matchId, query.viewerUserId, currentPage + 1),
    )
    .setLabel("Next")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages - 1);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton),
    ],
  };
}

export async function updateDuelLogPagination(
  interaction: ButtonInteraction,
  logs: string[],
  query: DuelLogPageQuery,
): Promise<void> {
  const payload = buildDuelLogPagePayload(logs, query);
  await interaction.update(payload);
}

function clampPage(page: number, totalPages: number): number {
  if (page < 0) return 0;
  if (page >= totalPages) return totalPages - 1;
  return page;
}
