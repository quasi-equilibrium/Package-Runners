import { Pool } from "pg";

export class Database {
  constructor() {
    this.pool = null;
    this.memory = {
      players: new Map(),
      matches: []
    };
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
      });
    }
  }

  get hasSql() {
    return Boolean(this.pool);
  }

  async init() {
    if (!this.pool) {
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        session_token TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        character_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        session_token TEXT PRIMARY KEY REFERENCES players(session_token) ON DELETE CASCADE,
        points_total INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        top3_count INTEGER NOT NULL DEFAULT 0,
        races_played INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS match_results (
        id TEXT PRIMARY KEY,
        level_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ NOT NULL,
        placements_json JSONB NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS match_events (
        id BIGSERIAL PRIMARY KEY,
        match_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async upsertPlayer(sessionToken, nickname, characterId) {
    if (this.pool) {
      await this.pool.query(
        `
        INSERT INTO players(session_token, nickname, character_id)
        VALUES ($1, $2, $3)
        ON CONFLICT(session_token)
        DO UPDATE SET nickname = EXCLUDED.nickname, character_id = EXCLUDED.character_id, updated_at = NOW();
      `,
        [sessionToken, nickname, characterId]
      );
      await this.pool.query(
        `
        INSERT INTO leaderboard(session_token) VALUES ($1)
        ON CONFLICT(session_token) DO NOTHING;
      `,
        [sessionToken]
      );
      return;
    }
    const existing = this.memory.players.get(sessionToken);
    this.memory.players.set(sessionToken, {
      sessionToken,
      nickname,
      characterId,
      pointsTotal: existing?.pointsTotal ?? 0,
      wins: existing?.wins ?? 0,
      top3Count: existing?.top3Count ?? 0,
      racesPlayed: existing?.racesPlayed ?? 0,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now()
    });
  }

  async recordMatchResult({ matchId, levelId, startedAt, finishedAt, placements, awardedPoints }) {
    const pointMap = new Map(awardedPoints.map((item) => [item.playerId, item.points]));
    if (this.pool) {
      await this.pool.query(
        `
        INSERT INTO match_results(id, level_id, started_at, finished_at, placements_json)
        VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0), TO_TIMESTAMP($4 / 1000.0), $5::jsonb)
        ON CONFLICT(id) DO NOTHING;
      `,
        [matchId, levelId, startedAt, finishedAt, JSON.stringify(placements)]
      );
      for (const placement of placements) {
        if (placement.isBot) {
          continue;
        }
        const points = pointMap.get(placement.playerId) ?? 0;
        const isWin = placement.rank === 1 ? 1 : 0;
        const isTop3 = placement.rank <= 3 ? 1 : 0;
        await this.pool.query(
          `
          UPDATE leaderboard
          SET points_total = points_total + $2,
              wins = wins + $3,
              top3_count = top3_count + $4,
              races_played = races_played + 1,
              updated_at = NOW()
          WHERE session_token = $1;
        `,
          [placement.playerId, points, isWin, isTop3]
        );
      }
      return;
    }
    this.memory.matches.push({
      matchId,
      levelId,
      startedAt,
      finishedAt,
      placements
    });
    for (const placement of placements) {
      if (placement.isBot) {
        continue;
      }
      const row = this.memory.players.get(placement.playerId);
      if (!row) {
        continue;
      }
      row.pointsTotal += pointMap.get(placement.playerId) ?? 0;
      row.wins += placement.rank === 1 ? 1 : 0;
      row.top3Count += placement.rank <= 3 ? 1 : 0;
      row.racesPlayed += 1;
      row.updatedAt = Date.now();
    }
  }

  async getLeaderboard(limit = 20) {
    if (this.pool) {
      const result = await this.pool.query(
        `
        SELECT p.session_token AS "playerId",
               p.nickname,
               p.character_id AS "characterId",
               l.points_total AS "pointsTotal",
               l.wins,
               l.top3_count AS "top3Count",
               l.races_played AS "racesPlayed"
        FROM leaderboard l
        JOIN players p ON p.session_token = l.session_token
        ORDER BY l.points_total DESC, l.wins DESC, l.top3_count DESC, p.updated_at DESC
        LIMIT $1;
      `,
        [limit]
      );
      return result.rows;
    }
    return [...this.memory.players.values()]
      .sort((a, b) => {
        if (b.pointsTotal !== a.pointsTotal) {
          return b.pointsTotal - a.pointsTotal;
        }
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        return b.top3Count - a.top3Count;
      })
      .slice(0, limit)
      .map((row) => ({
        playerId: row.sessionToken,
        nickname: row.nickname,
        characterId: row.characterId,
        pointsTotal: row.pointsTotal,
        wins: row.wins,
        top3Count: row.top3Count,
        racesPlayed: row.racesPlayed
      }));
  }
}
