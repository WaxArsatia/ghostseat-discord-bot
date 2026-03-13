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

class VoiceLeaderboardService {
  private readonly totalsByGuild = new Map<string, Map<string, number>>();
  private readonly activeSessionsByGuild = new Map<
    string,
    Map<string, number>
  >();
  private readonly dataFilePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    dataFilePath = resolve(process.cwd(), "data/voice-leaderboard.json"),
  ) {
    this.dataFilePath = dataFilePath;
    this.loadFromDisk();
  }

  async shutdown(): Promise<void> {
    const hasUpdates = this.flushActiveSessions(Date.now());
    if (hasUpdates) {
      this.queuePersist();
    }

    await this.persistQueue;
  }

  initializeFromClient(client: Client): void {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const voiceState of guild.voiceStates.cache.values()) {
        if (!voiceState.channelId || voiceState.member?.user.bot) continue;
        this.startSession(guild.id, voiceState.id, now);
      }
    }
  }

  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const isBot =
      newState.member?.user.bot ?? oldState.member?.user.bot ?? false;
    if (isBot) return;

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return;

    const now = Date.now();

    if (!oldChannelId && newChannelId) {
      this.startSession(guildId, userId, now);
      return;
    }

    if (oldChannelId && !newChannelId) {
      this.stopSession(guildId, userId, now);
      return;
    }

    this.startSession(guildId, userId, now);
  }

  async showLeaderboard(
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
    const leaderboard = this.getLeaderboard(guild.id, limit);

    if (leaderboard.length === 0) {
      await interaction.reply({
        content: "No voice activity has been recorded yet in this server.",
      });
      return;
    }

    const lines = leaderboard.map(
      (entry, index) =>
        `${index + 1}. <@${entry.userId}> — **${this.formatDuration(entry.totalMs)}**`,
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

  private getLeaderboard(guildId: string, limit: number): LeaderboardEntry[] {
    const normalizedLimit = Math.max(1, Math.min(limit, 25));
    const now = Date.now();
    const totals = new Map(this.totalsByGuild.get(guildId) ?? []);
    const activeSessions = this.activeSessionsByGuild.get(guildId);

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

  private startSession(
    guildId: string,
    userId: string,
    startedAt: number,
  ): void {
    const guildSessions = this.getActiveSessions(guildId);
    if (guildSessions.has(userId)) return;
    guildSessions.set(userId, startedAt);
  }

  private stopSession(guildId: string, userId: string, endedAt: number): void {
    const guildSessions = this.activeSessionsByGuild.get(guildId);
    if (!guildSessions) return;

    const startedAt = guildSessions.get(userId);
    if (startedAt === undefined) return;

    guildSessions.delete(userId);
    if (guildSessions.size === 0) {
      this.activeSessionsByGuild.delete(guildId);
    }

    const elapsed = Math.max(0, endedAt - startedAt);
    if (elapsed <= 0) return;

    const guildTotals = this.getTotals(guildId);
    guildTotals.set(userId, (guildTotals.get(userId) ?? 0) + elapsed);
    this.queuePersist();
  }

  private getTotals(guildId: string): Map<string, number> {
    const existing = this.totalsByGuild.get(guildId);
    if (existing) return existing;

    const created = new Map<string, number>();
    this.totalsByGuild.set(guildId, created);
    return created;
  }

  private getActiveSessions(guildId: string): Map<string, number> {
    const existing = this.activeSessionsByGuild.get(guildId);
    if (existing) return existing;

    const created = new Map<string, number>();
    this.activeSessionsByGuild.set(guildId, created);
    return created;
  }

  private flushActiveSessions(endedAt: number): boolean {
    let hasUpdates = false;

    for (const [guildId, sessions] of this.activeSessionsByGuild.entries()) {
      if (sessions.size === 0) continue;

      const totals = this.getTotals(guildId);
      for (const [userId, startedAt] of sessions.entries()) {
        const elapsed = Math.max(0, endedAt - startedAt);
        if (elapsed <= 0) continue;

        totals.set(userId, (totals.get(userId) ?? 0) + elapsed);
        hasUpdates = true;
      }
    }

    this.activeSessionsByGuild.clear();
    return hasUpdates;
  }

  private queuePersist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        await mkdir(dirname(this.dataFilePath), { recursive: true });
        await writeFile(
          this.dataFilePath,
          JSON.stringify(this.serialize(), null, 2),
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

  private serialize(): PersistedLeaderboard {
    const guilds: PersistedLeaderboard["guilds"] = {};

    for (const [guildId, totals] of this.totalsByGuild.entries()) {
      guilds[guildId] = {
        totals: Object.fromEntries(totals.entries()),
      };
    }

    return {
      version: 1,
      guilds,
    };
  }

  private loadFromDisk(): void {
    if (!existsSync(this.dataFilePath)) return;

    try {
      const raw = readFileSync(this.dataFilePath, "utf8");
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
          )
            continue;
          totals.set(userId, Math.max(0, milliseconds));
        }

        if (totals.size > 0) {
          this.totalsByGuild.set(guildId, totals);
        }
      }
    } catch (error) {
      console.error(
        "[VoiceLeaderboardService] Failed to load leaderboard data:",
        error,
      );
    }
  }

  private formatDuration(milliseconds: number): string {
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
}

export const voiceLeaderboardService = new VoiceLeaderboardService();
