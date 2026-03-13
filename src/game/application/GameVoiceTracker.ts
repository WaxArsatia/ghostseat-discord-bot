import type { Client, VoiceState } from "discord.js";

interface VoiceProgressPort {
  applyVoiceEligibleElapsed(
    guildId: string,
    userId: string,
    elapsedMs: number,
  ): unknown;
  touchVoiceTick(guildId: string, userId: string, tickAtMs: number): void;
}

interface ActiveVoiceSession {
  guildId: string;
  userId: string;
  lastAccruedAtMs: number;
}

const TICK_MS = 60 * 1000;

export function createGameVoiceTracker(voiceProgress: VoiceProgressPort) {
  const activeSessions = new Map<string, ActiveVoiceSession>();
  let interval: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    const now = Date.now();

    for (const [key, session] of activeSessions.entries()) {
      const elapsed = now - session.lastAccruedAtMs;
      if (elapsed <= 0) continue;

      try {
        voiceProgress.applyVoiceEligibleElapsed(
          session.guildId,
          session.userId,
          elapsed,
        );
        activeSessions.set(key, {
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
  };

  const initializeFromClient = (client: Client): void => {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const voiceState of guild.voiceStates.cache.values()) {
        if (!isEligibleForGameProgress(voiceState)) continue;

        const key = buildSessionKey(guild.id, voiceState.id);
        activeSessions.set(key, {
          guildId: guild.id,
          userId: voiceState.id,
          lastAccruedAtMs: now,
        });

        voiceProgress.touchVoiceTick(guild.id, voiceState.id, now);
      }
    }

    if (!interval) {
      interval = setInterval(() => {
        tick();
      }, TICK_MS);
    }
  };

  const handleVoiceStateUpdate = (
    oldState: VoiceState,
    newState: VoiceState,
  ): void => {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const key = buildSessionKey(guildId, userId);
    const now = Date.now();

    const existing = activeSessions.get(key);
    if (existing) {
      const elapsed = now - existing.lastAccruedAtMs;
      if (elapsed > 0) {
        voiceProgress.applyVoiceEligibleElapsed(guildId, userId, elapsed);
      }
    }

    if (isEligibleForGameProgress(newState)) {
      activeSessions.set(key, {
        guildId,
        userId,
        lastAccruedAtMs: now,
      });
      voiceProgress.touchVoiceTick(guildId, userId, now);
      return;
    }

    activeSessions.delete(key);

    if (!oldState.channelId && !newState.channelId) {
      return;
    }
  };

  const shutdown = (): void => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    const now = Date.now();
    for (const session of activeSessions.values()) {
      const elapsed = now - session.lastAccruedAtMs;
      if (elapsed <= 0) continue;

      voiceProgress.applyVoiceEligibleElapsed(
        session.guildId,
        session.userId,
        elapsed,
      );
    }

    activeSessions.clear();
  };

  return {
    initializeFromClient,
    handleVoiceStateUpdate,
    shutdown,
  };
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
