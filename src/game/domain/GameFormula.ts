import type { StatBlock } from "../../types/index.js";

export const LEVEL_CAP = 50;
export const DUEL_MAX_ROUNDS = 20;

export interface DuelParticipant {
  userId: string;
  stats: StatBlock;
  battlePower: number;
}

export interface DuelLogEntry {
  round: number;
  attackerUserId: string;
  defenderUserId: string;
  damage: number;
  remainingHp: number;
}

export interface DuelSimulationResult {
  estimatedWinChanceA: number;
  winnerUserId: string;
  roundCount: number;
  remainingHpA: number;
  remainingHpB: number;
  logs: DuelLogEntry[];
}

export function expToNextLevel(level: number): number {
  return 100 + 15 * Math.max(0, level - 1);
}

export function applyExpGain(
  level: number,
  exp: number,
  gainedExp: number,
): { level: number; exp: number } {
  let nextLevel = Math.max(1, level);
  let nextExp = Math.max(0, exp);
  let remainingGain = Math.max(0, gainedExp);

  if (nextLevel >= LEVEL_CAP) {
    return {
      level: LEVEL_CAP,
      exp: nextExp + remainingGain,
    };
  }

  while (remainingGain > 0 && nextLevel < LEVEL_CAP) {
    const needed = expToNextLevel(nextLevel) - nextExp;
    if (remainingGain >= needed) {
      remainingGain -= needed;
      nextLevel += 1;
      nextExp = 0;
      continue;
    }

    nextExp += remainingGain;
    remainingGain = 0;
  }

  if (nextLevel >= LEVEL_CAP && remainingGain > 0) {
    nextExp += remainingGain;
  }

  return {
    level: Math.min(nextLevel, LEVEL_CAP),
    exp: Math.max(0, nextExp),
  };
}

export function getBaseStatsForLevel(level: number): StatBlock {
  const normalizedLevel = Math.max(1, Math.min(level, LEVEL_CAP));
  return {
    atk: 20 + 2 * (normalizedLevel - 1),
    def: 20 + 2 * (normalizedLevel - 1),
    hp: 80 + 6 * (normalizedLevel - 1),
    spd: 15 + (normalizedLevel - 1),
  };
}

export function sumStats(stats: StatBlock[]): StatBlock {
  return stats.reduce<StatBlock>(
    (acc, current) => ({
      atk: acc.atk + current.atk,
      def: acc.def + current.def,
      hp: acc.hp + current.hp,
      spd: acc.spd + current.spd,
    }),
    { atk: 0, def: 0, hp: 0, spd: 0 },
  );
}

export function calculateBattlePower(stats: StatBlock): number {
  return Math.round(
    stats.atk * 1.2 + stats.def * 1.0 + stats.hp * 0.45 + stats.spd * 0.9,
  );
}

export function estimateWinChance(
  battlePowerA: number,
  battlePowerB: number,
): number {
  const raw = 1 / (1 + Math.exp(-(battlePowerA - battlePowerB) / 80));
  return clamp(raw, 0.15, 0.85);
}

export function simulateDuel(
  playerA: DuelParticipant,
  playerB: DuelParticipant,
): DuelSimulationResult {
  const estimatedWinChanceA = estimateWinChance(
    playerA.battlePower,
    playerB.battlePower,
  );

  let hpA = Math.max(1, playerA.stats.hp);
  let hpB = Math.max(1, playerB.stats.hp);
  const logs: DuelLogEntry[] = [];

  let round = 0;
  while (round < DUEL_MAX_ROUNDS && hpA > 0 && hpB > 0) {
    round += 1;

    const attacksFirst = decideFirstAttacker(
      playerA.stats.spd,
      playerB.stats.spd,
    )
      ? [playerA, playerB]
      : [playerB, playerA];

    for (const attacker of attacksFirst) {
      const defender = attacker.userId === playerA.userId ? playerB : playerA;
      if (attacker.userId === playerA.userId) {
        const damage = calculateDamage(playerA.stats.atk, playerB.stats.def);
        hpB = Math.max(0, hpB - damage);
        logs.push({
          round,
          attackerUserId: playerA.userId,
          defenderUserId: playerB.userId,
          damage,
          remainingHp: hpB,
        });
        if (hpB <= 0) break;
      } else {
        const damage = calculateDamage(playerB.stats.atk, playerA.stats.def);
        hpA = Math.max(0, hpA - damage);
        logs.push({
          round,
          attackerUserId: playerB.userId,
          defenderUserId: playerA.userId,
          damage,
          remainingHp: hpA,
        });
        if (hpA <= 0) break;
      }
      if (defender.userId === playerA.userId && hpA <= 0) break;
      if (defender.userId === playerB.userId && hpB <= 0) break;
    }
  }

  const winnerUserId =
    hpA === hpB
      ? Math.random() < 0.5
        ? playerA.userId
        : playerB.userId
      : hpA > hpB
        ? playerA.userId
        : playerB.userId;

  return {
    estimatedWinChanceA,
    winnerUserId,
    roundCount: round,
    remainingHpA: hpA,
    remainingHpB: hpB,
    logs,
  };
}

function calculateDamage(attackerAtk: number, defenderDef: number): number {
  const baseDamage = attackerAtk * (100 / (100 + Math.max(0, defenderDef)));
  const variance = 0.9 + Math.random() * 0.2;
  return Math.floor(Math.max(1, baseDamage * variance));
}

function decideFirstAttacker(speedA: number, speedB: number): boolean {
  if (speedA === speedB) {
    return Math.random() < 0.5;
  }
  return speedA > speedB;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
