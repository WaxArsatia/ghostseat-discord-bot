import { randomUUID } from "node:crypto";
import { applyExpGain, simulateDuel } from "../domain/GameFormula.js";
import { createGameUserError } from "./GameErrors.js";
import { buildProfileSnapshot, type ProfileResult } from "./ProfileUseCase.js";
import type {
  GameRepository,
  LeaderboardEntry,
  MatchHistoryRecord,
  PlayerProgress,
} from "../../types/index.js";

export const DUEL_COOLDOWN_MS = 30 * 1000;

interface CatalogReader {
  getById(itemId: string): ProfileResult["equippedItems"]["weapon"];
}

interface DuelDeps {
  repository: Pick<
    GameRepository,
    | "runInTransaction"
    | "ensurePlayer"
    | "getLoadout"
    | "updatePlayer"
    | "createMatchHistory"
    | "getMatchHistory"
    | "getLeaderboard"
  >;
  catalog: CatalogReader;
  nowMs?: () => number;
  nowIso?: () => string;
}

export interface DuelResult {
  matchId: string;
  playerA: PlayerProgress;
  playerB: PlayerProgress;
  statsA: ProfileResult["stats"];
  statsB: ProfileResult["stats"];
  estimatedWinChanceA: number;
  winnerUserId: string;
  roundCount: number;
  remainingHpA: number;
  remainingHpB: number;
  logs: string[];
}

export function runDuel(
  deps: DuelDeps,
  guildId: string,
  challengerUserId: string,
  opponentUserId: string,
): DuelResult {
  if (challengerUserId === opponentUserId) {
    throw createGameUserError("You cannot duel yourself.");
  }

  const nowMs = deps.nowMs ?? defaultNowMs;
  const nowIso = deps.nowIso ?? defaultNowIso;

  return deps.repository.runInTransaction(() => {
    const now = nowMs();
    const playerA = deps.repository.ensurePlayer(guildId, challengerUserId);
    const playerB = deps.repository.ensurePlayer(guildId, opponentUserId);

    assertDuelCooldown(playerA, now);
    assertDuelCooldown(playerB, now);

    const profileA = buildProfileSnapshot(
      {
        repository: deps.repository,
        catalog: deps.catalog,
      },
      guildId,
      challengerUserId,
    );
    const profileB = buildProfileSnapshot(
      {
        repository: deps.repository,
        catalog: deps.catalog,
      },
      guildId,
      opponentUserId,
    );

    const simulation = simulateDuel(
      {
        userId: challengerUserId,
        stats: profileA.stats.total,
        battlePower: profileA.stats.battlePower,
      },
      {
        userId: opponentUserId,
        stats: profileB.stats.total,
        battlePower: profileB.stats.battlePower,
      },
    );

    const logs = simulation.logs.map(
      (entry) =>
        `R${entry.round} • <@${entry.attackerUserId}> hits <@${entry.defenderUserId}> for **${entry.damage}** dmg (HP: ${entry.remainingHp})`,
    );

    const winnerIsA = simulation.winnerUserId === challengerUserId;
    const expGainA = winnerIsA ? 20 : 10;
    const expGainB = winnerIsA ? 10 : 20;

    const progressedA = applyExpGain(playerA.level, playerA.exp, expGainA);
    const progressedB = applyExpGain(playerB.level, playerB.exp, expGainB);

    playerA.level = progressedA.level;
    playerA.exp = progressedA.exp;
    playerA.lastDuelAtMs = now;
    playerA.updatedAt = nowIso();

    playerB.level = progressedB.level;
    playerB.exp = progressedB.exp;
    playerB.lastDuelAtMs = now;
    playerB.updatedAt = nowIso();

    deps.repository.updatePlayer(playerA);
    deps.repository.updatePlayer(playerB);

    const matchId = randomUUID();
    const historyRecord: MatchHistoryRecord = {
      matchId,
      guildId,
      playerAUserId: challengerUserId,
      playerBUserId: opponentUserId,
      battlePowerA: profileA.stats.battlePower,
      battlePowerB: profileB.stats.battlePower,
      estimatedWinChanceA: simulation.estimatedWinChanceA,
      roundCount: simulation.roundCount,
      remainingHpA: simulation.remainingHpA,
      remainingHpB: simulation.remainingHpB,
      battleLog: logs,
      winnerUserId: simulation.winnerUserId,
      createdAt: nowIso(),
    };
    deps.repository.createMatchHistory(historyRecord);

    return {
      matchId,
      playerA,
      playerB,
      statsA: profileA.stats,
      statsB: profileB.stats,
      estimatedWinChanceA: simulation.estimatedWinChanceA,
      winnerUserId: simulation.winnerUserId,
      roundCount: simulation.roundCount,
      remainingHpA: simulation.remainingHpA,
      remainingHpB: simulation.remainingHpB,
      logs,
    };
  });
}

export function getDuelHistory(
  deps: DuelDeps,
  guildId: string,
  matchId: string,
): MatchHistoryRecord | null {
  return deps.repository.getMatchHistory(guildId, matchId);
}

export function getLeaderboard(
  deps: DuelDeps,
  guildId: string,
  limit: number,
): LeaderboardEntry[] {
  return deps.repository.getLeaderboard(guildId, limit);
}

function assertDuelCooldown(player: PlayerProgress, now: number): void {
  const elapsed = now - player.lastDuelAtMs;
  if (elapsed >= DUEL_COOLDOWN_MS) return;

  const waitSeconds = Math.ceil((DUEL_COOLDOWN_MS - elapsed) / 1000);
  throw createGameUserError(
    `<@${player.userId}> is on duel cooldown for ${waitSeconds}s.`,
  );
}

function defaultNowMs(): number {
  return Date.now();
}

function defaultNowIso(): string {
  return new Date().toISOString();
}
