import type { Client, VoiceState } from "discord.js";
import { GameService } from "./GameService.js";

interface ActiveVoiceSession {
  guildId: string;
  userId: string;
  lastAccruedAtMs: number;
}

const TICK_MS = 60 * 1000;

export class GameVoiceTracker {
  private readonly activeSessions = new Map<string, ActiveVoiceSession>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly gameService: GameService) {}

  initializeFromClient(client: Client): void {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const voiceState of guild.voiceStates.cache.values()) {
        if (!isEligibleForGameProgress(voiceState)) continue;

        const key = buildSessionKey(guild.id, voiceState.id);
        this.activeSessions.set(key, {
          guildId: guild.id,
          userId: voiceState.id,
          lastAccruedAtMs: now,
        });

        this.gameService.touchVoiceTick(guild.id, voiceState.id, now);
      }
    }

    if (!this.interval) {
      this.interval = setInterval(() => {
        this.tick();
      }, TICK_MS);
    }
  }

  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const key = buildSessionKey(guildId, userId);
    const now = Date.now();

    const existing = this.activeSessions.get(key);
    if (existing) {
      const elapsed = now - existing.lastAccruedAtMs;
      if (elapsed > 0) {
        this.gameService.applyVoiceEligibleElapsed(guildId, userId, elapsed);
      }
    }

    if (isEligibleForGameProgress(newState)) {
      this.activeSessions.set(key, {
        guildId,
        userId,
        lastAccruedAtMs: now,
      });
      this.gameService.touchVoiceTick(guildId, userId, now);
      return;
    }

    this.activeSessions.delete(key);

    if (!oldState.channelId && !newState.channelId) {
      return;
    }
  }

  shutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const now = Date.now();
    for (const session of this.activeSessions.values()) {
      const elapsed = now - session.lastAccruedAtMs;
      if (elapsed <= 0) continue;

      this.gameService.applyVoiceEligibleElapsed(
        session.guildId,
        session.userId,
        elapsed,
      );
    }

    this.activeSessions.clear();
  }

  private tick(): void {
    const now = Date.now();

    for (const [key, session] of this.activeSessions.entries()) {
      const elapsed = now - session.lastAccruedAtMs;
      if (elapsed <= 0) continue;

      try {
        this.gameService.applyVoiceEligibleElapsed(
          session.guildId,
          session.userId,
          elapsed,
        );
        this.activeSessions.set(key, {
          ...session,
          lastAccruedAtMs: now,
        });
      } catch (error) {
        console.error(
          `[GameVoiceTracker] Failed to accrue voice progress for ${session.guildId}:${session.userId}`,
          error,
        );
      }
    }
  }
}

function isEligibleForGameProgress(voiceState: VoiceState): boolean {
  if (!voiceState.channelId) return false;
  if (voiceState.member?.user.bot) return false;
  const afkChannelId = voiceState.guild.afkChannelId;
  if (afkChannelId && voiceState.channelId === afkChannelId) return false;
  return true;
}

function buildSessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}
