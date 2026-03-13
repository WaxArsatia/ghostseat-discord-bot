import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  ChatInputCommandInteraction,
  Client,
  VoiceState,
} from "discord.js";
import { MessageFlags } from "discord.js";

interface PersistedLeaderboard {
  version: 1;
  guilds: Record<string, { totals: Record<string, number> }>;
}

interface LeaderboardEntry {
  userId: string;
  totalMs: number;
}

const totalsByGuild = new Map<string, Map<string, number>>();
const activeSessionsByGuild = new Map<string, Map<string, number>>();
const dataFilePath = resolve(process.cwd(), "data/voice-leaderboard.json");
let persistQueue: Promise<void> = Promise.resolve();

export async function shutdownVoiceLeaderboard(): Promise<void> {
  const hasUpdates = flushActiveSessions(Date.now());
  if (hasUpdates) {
    queuePersist();
  }

  await persistQueue;
}

export function initializeVoiceLeaderboardFromClient(client: Client): void {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    for (const voiceState of guild.voiceStates.cache.values()) {
      if (!voiceState.channelId || voiceState.member?.user.bot) continue;
      startSession(guild.id, voiceState.id, now);
    }
  }
}

export function handleVoiceLeaderboardVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): void {
  const guildId = newState.guild.id;
  const userId = newState.id;
  const isBot = newState.member?.user.bot ?? oldState.member?.user.bot ?? false;
  if (isBot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const now = Date.now();

  if (!oldChannelId && newChannelId) {
    startSession(guildId, userId, now);
    return;
  }

  if (oldChannelId && !newChannelId) {
    stopSession(guildId, userId, now);
    return;
  }

  startSession(guildId, userId, now);
}

export async function showVoiceLeaderboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const limit = interaction.options.getInteger("limit") ?? 10;
  const leaderboard = getLeaderboard(guild.id, limit);

  if (leaderboard.length === 0) {
    await interaction.reply({
      content: "No voice activity has been recorded yet in this server.",
    });
    return;
  }

  const lines = leaderboard.map(
    (entry, index) =>
      `${index + 1}. <@${entry.userId}> — **${formatDuration(entry.totalMs)}**`,
  );

  await interaction.reply({
    content: [
      "🏆 **Voice Activity Leaderboard**",
      `Top ${leaderboard.length} member(s) in **${guild.name}**`,
      "",
      ...lines,
    ].join("\n"),
  });
}

function getLeaderboard(guildId: string, limit: number): LeaderboardEntry[] {
  const normalizedLimit = Math.max(1, Math.min(limit, 25));
  const now = Date.now();
  const totals = new Map(totalsByGuild.get(guildId) ?? []);
  const activeSessions = activeSessionsByGuild.get(guildId);

  if (activeSessions) {
    for (const [userId, startedAt] of activeSessions.entries()) {
      const elapsed = Math.max(0, now - startedAt);
      totals.set(userId, (totals.get(userId) ?? 0) + elapsed);
    }
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, normalizedLimit)
    .map(([userId, totalMs]) => ({ userId, totalMs }));
}

function startSession(
  guildId: string,
  userId: string,
  startedAt: number,
): void {
  const guildSessions = getActiveSessions(guildId);
  if (guildSessions.has(userId)) return;
  guildSessions.set(userId, startedAt);
}

function stopSession(guildId: string, userId: string, endedAt: number): void {
  const guildSessions = activeSessionsByGuild.get(guildId);
  if (!guildSessions) return;

  const startedAt = guildSessions.get(userId);
  if (startedAt === undefined) return;

  guildSessions.delete(userId);
  if (guildSessions.size === 0) {
    activeSessionsByGuild.delete(guildId);
  }

  const elapsed = Math.max(0, endedAt - startedAt);
  if (elapsed <= 0) return;

  const guildTotals = getTotals(guildId);
  guildTotals.set(userId, (guildTotals.get(userId) ?? 0) + elapsed);
  queuePersist();
}

function getTotals(guildId: string): Map<string, number> {
  const existing = totalsByGuild.get(guildId);
  if (existing) return existing;

  const created = new Map<string, number>();
  totalsByGuild.set(guildId, created);
  return created;
}

function getActiveSessions(guildId: string): Map<string, number> {
  const existing = activeSessionsByGuild.get(guildId);
  if (existing) return existing;

  const created = new Map<string, number>();
  activeSessionsByGuild.set(guildId, created);
  return created;
}

function flushActiveSessions(endedAt: number): boolean {
  let hasUpdates = false;

  for (const [guildId, sessions] of activeSessionsByGuild.entries()) {
    if (sessions.size === 0) continue;

    const totals = getTotals(guildId);
    for (const [userId, startedAt] of sessions.entries()) {
      const elapsed = Math.max(0, endedAt - startedAt);
      if (elapsed <= 0) continue;

      totals.set(userId, (totals.get(userId) ?? 0) + elapsed);
      hasUpdates = true;
    }
  }

  activeSessionsByGuild.clear();
  return hasUpdates;
}

function queuePersist(): void {
  persistQueue = persistQueue
    .then(async () => {
      await mkdir(dirname(dataFilePath), { recursive: true });
      await writeFile(
        dataFilePath,
        JSON.stringify(serialize(), null, 2),
        "utf8",
      );
    })
    .catch((error) => {
      console.error(
        "[VoiceLeaderboardService] Failed to persist leaderboard data:",
        error,
      );
    });
}

function serialize(): PersistedLeaderboard {
  const guilds: PersistedLeaderboard["guilds"] = {};

  for (const [guildId, totals] of totalsByGuild.entries()) {
    guilds[guildId] = {
      totals: Object.fromEntries(totals.entries()),
    };
  }

  return {
    version: 1,
    guilds,
  };
}

function loadFromDisk(): void {
  if (!existsSync(dataFilePath)) return;

  try {
    const raw = readFileSync(dataFilePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedLeaderboard>;
    if (!parsed.guilds || typeof parsed.guilds !== "object") return;

    for (const [guildId, guildData] of Object.entries(parsed.guilds)) {
      if (!guildData || typeof guildData !== "object") continue;

      const totals = new Map<string, number>();
      for (const [userId, milliseconds] of Object.entries(
        guildData.totals ?? {},
      )) {
        if (
          typeof milliseconds !== "number" ||
          !Number.isFinite(milliseconds)
        ) {
          continue;
        }
        totals.set(userId, Math.max(0, milliseconds));
      }

      if (totals.size > 0) {
        totalsByGuild.set(guildId, totals);
      }
    }
  } catch (error) {
    console.error(
      "[VoiceLeaderboardService] Failed to load leaderboard data:",
      error,
    );
  }
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  if (parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.slice(0, 3).join(" ");
}

loadFromDisk();
