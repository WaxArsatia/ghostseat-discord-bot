import { applyExpGain } from "../domain/GameFormula.js";
import type { GameRepository, PlayerProgress } from "../../types/index.js";

export const VOICE_INTERVAL_MS = 15 * 60 * 1000;
export const VOICE_EXP_PER_INTERVAL = 10;

interface VoiceProgressDeps {
  repository: Pick<
    GameRepository,
    | "runInTransaction"
    | "ensurePlayer"
    | "getVoiceProgress"
    | "updateVoiceProgress"
    | "updatePlayer"
  >;
  nowMs?: () => number;
  nowIso?: () => string;
}

export interface VoiceAccrualResult {
  awardedIntervals: number;
  ticketsGained: number;
  expGained: number;
  player: PlayerProgress;
}

export function applyVoiceEligibleElapsed(
  deps: VoiceProgressDeps,
  guildId: string,
  userId: string,
  elapsedMs: number,
): VoiceAccrualResult | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return null;
  }

  const nowMs = deps.nowMs ?? defaultNowMs;
  const nowIso = deps.nowIso ?? defaultNowIso;

  return deps.repository.runInTransaction(() => {
    const player = deps.repository.ensurePlayer(guildId, userId);
    const voiceProgress = deps.repository.getVoiceProgress(guildId, userId);

    const eligibleTotal =
      Math.max(0, voiceProgress.eligibleMilliseconds) + Math.floor(elapsedMs);
    const awardedIntervals = Math.floor(eligibleTotal / VOICE_INTERVAL_MS);
    const remainder = eligibleTotal % VOICE_INTERVAL_MS;

    voiceProgress.eligibleMilliseconds = remainder;
    voiceProgress.lastTickAtMs = nowMs();
    voiceProgress.updatedAt = nowIso();
    deps.repository.updateVoiceProgress(voiceProgress);

    if (awardedIntervals <= 0) {
      return null;
    }

    const expGained = awardedIntervals * VOICE_EXP_PER_INTERVAL;
    const progressed = applyExpGain(player.level, player.exp, expGained);

    player.level = progressed.level;
    player.exp = progressed.exp;
    player.tickets += awardedIntervals;
    player.updatedAt = nowIso();
    deps.repository.updatePlayer(player);

    return {
      awardedIntervals,
      ticketsGained: awardedIntervals,
      expGained,
      player,
    };
  });
}

export function touchVoiceTick(
  deps: VoiceProgressDeps,
  guildId: string,
  userId: string,
  tickAtMs: number,
): void {
  const nowIso = deps.nowIso ?? defaultNowIso;

  deps.repository.runInTransaction(() => {
    const voiceProgress = deps.repository.getVoiceProgress(guildId, userId);
    voiceProgress.lastTickAtMs = tickAtMs;
    voiceProgress.updatedAt = nowIso();
    deps.repository.updateVoiceProgress(voiceProgress);
  });
}

function defaultNowMs(): number {
  return Date.now();
}

function defaultNowIso(): string {
  return new Date().toISOString();
}
