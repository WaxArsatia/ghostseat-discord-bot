import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  EquipSlot,
  EquipmentLoadout,
  GameRepository,
  InventoryOwnership,
  LeaderboardEntry,
  MatchHistoryRecord,
  PlayerProgress,
  VoiceProgress,
} from "../../types/index.js";

interface PlayerRow {
  guild_id: string;
  user_id: string;
  level: number;
  exp: number;
  tickets: number;
  shards: number;
  pity_epic_counter: number;
  pity_legendary_counter: number;
  last_duel_at_ms: number;
  created_at: string;
  updated_at: string;
}

interface VoiceProgressRow {
  guild_id: string;
  user_id: string;
  eligible_milliseconds: number;
  last_tick_at_ms: number;
  updated_at: string;
}

interface OwnershipRow {
  guild_id: string;
  user_id: string;
  item_id: string;
  acquired_at: string;
}

interface LoadoutRow {
  guild_id: string;
  user_id: string;
  weapon_item_id: string | null;
  armor_item_id: string | null;
  accessory_item_id: string | null;
  updated_at: string;
}

interface MatchHistoryRow {
  match_id: string;
  guild_id: string;
  player_a_user_id: string;
  player_b_user_id: string;
  battle_power_a: number;
  battle_power_b: number;
  estimated_win_chance_a: number;
  round_count: number;
  remaining_hp_a: number;
  remaining_hp_b: number;
  battle_log: string;
  winner_user_id: string;
  created_at: string;
}

interface LeaderboardRow {
  user_id: string;
  level: number;
  exp: number;
}

export function createSQLiteGameRepository(
  dbPath = resolve(process.cwd(), "data/game.sqlite"),
): GameRepository {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  function initialize(): void {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA foreign_keys = ON;");

    db.run(`
      CREATE TABLE IF NOT EXISTS players (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        tickets INTEGER NOT NULL DEFAULT 0,
        shards INTEGER NOT NULL DEFAULT 0,
        pity_epic_counter INTEGER NOT NULL DEFAULT 0,
        pity_legendary_counter INTEGER NOT NULL DEFAULT 0,
        last_duel_at_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS voice_progress (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        eligible_milliseconds INTEGER NOT NULL DEFAULT 0,
        last_tick_at_ms INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id, user_id) REFERENCES players(guild_id, user_id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS inventory_ownership (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id, item_id),
        FOREIGN KEY (guild_id, user_id) REFERENCES players(guild_id, user_id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS loadouts (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        weapon_item_id TEXT,
        armor_item_id TEXT,
        accessory_item_id TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, user_id),
        FOREIGN KEY (guild_id, user_id) REFERENCES players(guild_id, user_id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS match_history (
        match_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        player_a_user_id TEXT NOT NULL,
        player_b_user_id TEXT NOT NULL,
        battle_power_a INTEGER NOT NULL,
        battle_power_b INTEGER NOT NULL,
        estimated_win_chance_a REAL NOT NULL,
        round_count INTEGER NOT NULL,
        remaining_hp_a INTEGER NOT NULL,
        remaining_hp_b INTEGER NOT NULL,
        battle_log TEXT NOT NULL,
        winner_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_players_leaderboard ON players (guild_id, level DESC, exp DESC)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_match_history_guild_created ON match_history (guild_id, created_at DESC)",
    );
  }

  function runInReadTransaction<T>(callback: () => T): T {
    const tx = db.transaction(callback);
    return tx();
  }

  function runInWriteTransaction<T>(callback: () => T): T {
    const tx = db.transaction(callback);
    return tx.immediate();
  }

  function ensurePlayer(guildId: string, userId: string): PlayerProgress {
    const now = nowIso();
    db.query(
      `
          INSERT OR IGNORE INTO players (
            guild_id,
            user_id,
            level,
            exp,
            tickets,
            shards,
            pity_epic_counter,
            pity_legendary_counter,
            last_duel_at_ms,
            created_at,
            updated_at
          ) VALUES ($guildId, $userId, 1, 0, 0, 0, 0, 0, 0, $now, $now)
        `,
    ).run({
      $guildId: guildId,
      $userId: userId,
      $now: now,
    });

    const row = db
      .query<
        PlayerRow,
        { $guildId: string; $userId: string }
      >("SELECT * FROM players WHERE guild_id = $guildId AND user_id = $userId")
      .get({
        $guildId: guildId,
        $userId: userId,
      });

    if (!row) {
      throw new Error("[SQLiteGameRepository] Failed to ensure player row");
    }

    return mapPlayerRow(row);
  }

  function updatePlayer(player: PlayerProgress): void {
    db.query(
      `
          UPDATE players
          SET
            level = $level,
            exp = $exp,
            tickets = $tickets,
            shards = $shards,
            pity_epic_counter = $pityEpicCounter,
            pity_legendary_counter = $pityLegendaryCounter,
            last_duel_at_ms = $lastDuelAtMs,
            updated_at = $updatedAt
          WHERE guild_id = $guildId AND user_id = $userId
        `,
    ).run({
      $level: player.level,
      $exp: player.exp,
      $tickets: player.tickets,
      $shards: player.shards,
      $pityEpicCounter: player.pityEpicCounter,
      $pityLegendaryCounter: player.pityLegendaryCounter,
      $lastDuelAtMs: player.lastDuelAtMs,
      $updatedAt: player.updatedAt,
      $guildId: player.guildId,
      $userId: player.userId,
    });
  }

  function getVoiceProgress(guildId: string, userId: string): VoiceProgress {
    ensurePlayer(guildId, userId);

    const now = Date.now();
    db.query(
      `
          INSERT OR IGNORE INTO voice_progress (
            guild_id,
            user_id,
            eligible_milliseconds,
            last_tick_at_ms,
            updated_at
          ) VALUES ($guildId, $userId, 0, $nowMs, $nowIso)
        `,
    ).run({
      $guildId: guildId,
      $userId: userId,
      $nowMs: now,
      $nowIso: nowIso(),
    });

    const row = db
      .query<
        VoiceProgressRow,
        { $guildId: string; $userId: string }
      >("SELECT * FROM voice_progress WHERE guild_id = $guildId AND user_id = $userId")
      .get({
        $guildId: guildId,
        $userId: userId,
      });

    if (!row) {
      throw new Error("[SQLiteGameRepository] Failed to fetch voice_progress");
    }

    return mapVoiceProgressRow(row);
  }

  function updateVoiceProgress(voiceProgress: VoiceProgress): void {
    db.query(
      `
          UPDATE voice_progress
          SET
            eligible_milliseconds = $eligibleMilliseconds,
            last_tick_at_ms = $lastTickAtMs,
            updated_at = $updatedAt
          WHERE guild_id = $guildId AND user_id = $userId
        `,
    ).run({
      $eligibleMilliseconds: voiceProgress.eligibleMilliseconds,
      $lastTickAtMs: voiceProgress.lastTickAtMs,
      $updatedAt: voiceProgress.updatedAt,
      $guildId: voiceProgress.guildId,
      $userId: voiceProgress.userId,
    });
  }

  function listInventory(
    guildId: string,
    userId: string,
  ): InventoryOwnership[] {
    ensurePlayer(guildId, userId);

    const rows = db
      .query<OwnershipRow, { $guildId: string; $userId: string }>(
        `
          SELECT *
          FROM inventory_ownership
          WHERE guild_id = $guildId AND user_id = $userId
          ORDER BY acquired_at ASC, item_id ASC
        `,
      )
      .all({
        $guildId: guildId,
        $userId: userId,
      });

    return rows.map(mapOwnershipRow);
  }

  function addInventoryOwnership(
    guildId: string,
    userId: string,
    itemId: string,
    acquiredAt: string,
  ): boolean {
    ensurePlayer(guildId, userId);

    const result = db
      .query(
        `
          INSERT OR IGNORE INTO inventory_ownership (
            guild_id,
            user_id,
            item_id,
            acquired_at
          ) VALUES ($guildId, $userId, $itemId, $acquiredAt)
        `,
      )
      .run({
        $guildId: guildId,
        $userId: userId,
        $itemId: itemId,
        $acquiredAt: acquiredAt,
      });

    return result.changes > 0;
  }

  function getLoadout(guildId: string, userId: string): EquipmentLoadout {
    ensurePlayer(guildId, userId);

    db.query(
      `
          INSERT OR IGNORE INTO loadouts (
            guild_id,
            user_id,
            weapon_item_id,
            armor_item_id,
            accessory_item_id,
            updated_at
          ) VALUES ($guildId, $userId, NULL, NULL, NULL, $updatedAt)
        `,
    ).run({
      $guildId: guildId,
      $userId: userId,
      $updatedAt: nowIso(),
    });

    const row = db
      .query<
        LoadoutRow,
        { $guildId: string; $userId: string }
      >("SELECT * FROM loadouts WHERE guild_id = $guildId AND user_id = $userId")
      .get({
        $guildId: guildId,
        $userId: userId,
      });

    if (!row) {
      throw new Error("[SQLiteGameRepository] Failed to fetch loadout");
    }

    return mapLoadoutRow(row);
  }

  function setLoadoutSlot(
    guildId: string,
    userId: string,
    slot: EquipSlot,
    itemId: string | null,
  ): EquipmentLoadout {
    getLoadout(guildId, userId);

    const now = nowIso();

    if (slot === "weapon") {
      db.query(
        `
            UPDATE loadouts
            SET weapon_item_id = $itemId, updated_at = $updatedAt
            WHERE guild_id = $guildId AND user_id = $userId
          `,
      ).run({
        $itemId: itemId,
        $updatedAt: now,
        $guildId: guildId,
        $userId: userId,
      });
    } else if (slot === "armor") {
      db.query(
        `
            UPDATE loadouts
            SET armor_item_id = $itemId, updated_at = $updatedAt
            WHERE guild_id = $guildId AND user_id = $userId
          `,
      ).run({
        $itemId: itemId,
        $updatedAt: now,
        $guildId: guildId,
        $userId: userId,
      });
    } else {
      db.query(
        `
            UPDATE loadouts
            SET accessory_item_id = $itemId, updated_at = $updatedAt
            WHERE guild_id = $guildId AND user_id = $userId
          `,
      ).run({
        $itemId: itemId,
        $updatedAt: now,
        $guildId: guildId,
        $userId: userId,
      });
    }

    return getLoadout(guildId, userId);
  }

  function createMatchHistory(record: MatchHistoryRecord): void {
    db.query(
      `
          INSERT INTO match_history (
            match_id,
            guild_id,
            player_a_user_id,
            player_b_user_id,
            battle_power_a,
            battle_power_b,
            estimated_win_chance_a,
            round_count,
            remaining_hp_a,
            remaining_hp_b,
            battle_log,
            winner_user_id,
            created_at
          ) VALUES (
            $matchId,
            $guildId,
            $playerAUserId,
            $playerBUserId,
            $battlePowerA,
            $battlePowerB,
            $estimatedWinChanceA,
            $roundCount,
            $remainingHpA,
            $remainingHpB,
            $battleLog,
            $winnerUserId,
            $createdAt
          )
        `,
    ).run({
      $matchId: record.matchId,
      $guildId: record.guildId,
      $playerAUserId: record.playerAUserId,
      $playerBUserId: record.playerBUserId,
      $battlePowerA: record.battlePowerA,
      $battlePowerB: record.battlePowerB,
      $estimatedWinChanceA: record.estimatedWinChanceA,
      $roundCount: record.roundCount,
      $remainingHpA: record.remainingHpA,
      $remainingHpB: record.remainingHpB,
      $battleLog: JSON.stringify(record.battleLog),
      $winnerUserId: record.winnerUserId,
      $createdAt: record.createdAt,
    });
  }

  function getMatchHistory(
    guildId: string,
    matchId: string,
  ): MatchHistoryRecord | null {
    const row = db
      .query<
        MatchHistoryRow,
        { $guildId: string; $matchId: string }
      >("SELECT * FROM match_history WHERE guild_id = $guildId AND match_id = $matchId")
      .get({
        $guildId: guildId,
        $matchId: matchId,
      });

    if (!row) {
      return null;
    }

    return mapMatchHistoryRow(row);
  }

  function getLeaderboard(guildId: string, limit: number): LeaderboardEntry[] {
    const normalizedLimit = Math.max(1, Math.min(limit, 25));

    const rows = db
      .query<LeaderboardRow, { $guildId: string; $limit: number }>(
        `
          SELECT user_id, level, exp
          FROM players
          WHERE guild_id = $guildId
          ORDER BY level DESC, exp DESC
          LIMIT $limit
        `,
      )
      .all({
        $guildId: guildId,
        $limit: normalizedLimit,
      });

    return rows.map((row) => ({
      userId: row.user_id,
      level: row.level,
      exp: row.exp,
    }));
  }

  return {
    initialize,
    runInReadTransaction,
    runInWriteTransaction,
    ensurePlayer,
    updatePlayer,
    getVoiceProgress,
    updateVoiceProgress,
    listInventory,
    addInventoryOwnership,
    getLoadout,
    setLoadoutSlot,
    createMatchHistory,
    getMatchHistory,
    getLeaderboard,
  };
}

function mapPlayerRow(row: PlayerRow): PlayerProgress {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    level: row.level,
    exp: row.exp,
    tickets: row.tickets,
    shards: row.shards,
    pityEpicCounter: row.pity_epic_counter,
    pityLegendaryCounter: row.pity_legendary_counter,
    lastDuelAtMs: row.last_duel_at_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVoiceProgressRow(row: VoiceProgressRow): VoiceProgress {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    eligibleMilliseconds: row.eligible_milliseconds,
    lastTickAtMs: row.last_tick_at_ms,
    updatedAt: row.updated_at,
  };
}

function mapOwnershipRow(row: OwnershipRow): InventoryOwnership {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    itemId: row.item_id,
    acquiredAt: row.acquired_at,
  };
}

function mapLoadoutRow(row: LoadoutRow): EquipmentLoadout {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    weaponItemId: row.weapon_item_id,
    armorItemId: row.armor_item_id,
    accessoryItemId: row.accessory_item_id,
    updatedAt: row.updated_at,
  };
}

function mapMatchHistoryRow(row: MatchHistoryRow): MatchHistoryRecord {
  let battleLog: string[] = [];
  try {
    const parsedLog = JSON.parse(row.battle_log) as unknown;
    battleLog = Array.isArray(parsedLog)
      ? parsedLog.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    battleLog = [];
  }

  return {
    matchId: row.match_id,
    guildId: row.guild_id,
    playerAUserId: row.player_a_user_id,
    playerBUserId: row.player_b_user_id,
    battlePowerA: row.battle_power_a,
    battlePowerB: row.battle_power_b,
    estimatedWinChanceA: row.estimated_win_chance_a,
    roundCount: row.round_count,
    remainingHpA: row.remaining_hp_a,
    remainingHpB: row.remaining_hp_b,
    battleLog,
    winnerUserId: row.winner_user_id,
    createdAt: row.created_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}
