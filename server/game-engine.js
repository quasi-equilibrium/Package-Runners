import { randomUUID } from "node:crypto";
import { GAME_CONFIG, LEVELS, POWER_TYPES } from "../shared/constants.js";

function chance(probability) {
  return Math.random() < probability;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickRandomPower() {
  const index = Math.floor(Math.random() * POWER_TYPES.length);
  return POWER_TYPES[index];
}

function makeBotId() {
  return `bot_${randomUUID().slice(0, 8)}`;
}

export class GameEngine {
  constructor({ onPowerGranted, onPowerResult, onMatchFinish, onSnapshot }) {
    this.onPowerGranted = onPowerGranted;
    this.onPowerResult = onPowerResult;
    this.onMatchFinish = onMatchFinish;
    this.onSnapshot = onSnapshot;

    this.match = null;
    this.lastTickMs = Date.now();
    this.lastSnapshotMs = Date.now();
  }

  get isRunning() {
    return Boolean(this.match);
  }

  hasPlayer(playerId) {
    return this.match?.racers.some((racer) => racer.playerId === playerId && !racer.isBot) ?? false;
  }

  canResume(playerId) {
    if (!this.match) {
      return false;
    }
    const now = Date.now();
    const racer = this.match.racers.find((entry) => entry.playerId === playerId && !entry.isBot);
    return Boolean(racer && racer.disconnectedUntil && racer.disconnectedUntil > now);
  }

  resumePlayer(playerId) {
    if (!this.match) {
      return false;
    }
    const racer = this.match.racers.find((entry) => entry.playerId === playerId && !entry.isBot);
    if (!racer) {
      return false;
    }
    racer.connected = true;
    racer.disconnectedUntil = null;
    return true;
  }

  markDisconnected(playerId) {
    if (!this.match) {
      return;
    }
    const racer = this.match.racers.find((entry) => entry.playerId === playerId && !entry.isBot);
    if (!racer) {
      return;
    }
    racer.connected = false;
    racer.disconnectedUntil = Date.now() + GAME_CONFIG.RECONNECT_GRACE_MS;
  }

  startMatch({ levelId, humans, nowMs = Date.now() }) {
    const level = LEVELS[levelId] ?? LEVELS.ice;
    const racers = [];
    for (const human of humans) {
      racers.push({
        id: human.playerId,
        playerId: human.playerId,
        nickname: human.nickname,
        characterId: human.characterId,
        isBot: false,
        connected: true,
        x: 0,
        y: 0,
        vy: 0,
        state: "run",
        slideUntil: 0,
        slowUntil: 0,
        rocketUntil: 0,
        powerSlot: null,
        finishedAt: null,
        rank: null,
        hazardHits: new Set(),
        boxClaims: new Set(),
        disconnectedUntil: null,
        botCooldownUntil: 0
      });
    }
    while (racers.length < GAME_CONFIG.MAX_PLAYERS) {
      racers.push({
        id: makeBotId(),
        playerId: makeBotId(),
        nickname: `BOT-${Math.floor(Math.random() * 90 + 10)}`,
        characterId: ["doritos_like", "cheetos_like", "pringles_like", "biskrem_like"][Math.floor(Math.random() * 4)],
        isBot: true,
        connected: true,
        x: 0,
        y: 0,
        vy: 0,
        state: "run",
        slideUntil: 0,
        slowUntil: 0,
        rocketUntil: 0,
        powerSlot: null,
        finishedAt: null,
        rank: null,
        hazardHits: new Set(),
        boxClaims: new Set(),
        disconnectedUntil: null,
        botCooldownUntil: 0
      });
    }

    const hazards = level.obstacles.map((hazard) => ({ ...hazard }));
    this.match = {
      matchId: randomUUID(),
      seed: Math.floor(Math.random() * 1_000_000_000),
      levelId: level.id,
      levelLabel: level.label,
      kickoffAt: nowMs + 1800,
      startedAt: nowMs + 1800,
      endsAt: nowMs + 1800 + GAME_CONFIG.MATCH_TIME_LIMIT_MS,
      trackLength: GAME_CONFIG.TRACK_LENGTH,
      racers,
      hazards,
      oils: [],
      finishes: [],
      currentBox: null,
      nextBoxAt: nowMs + 1800 + GAME_CONFIG.BOX_INTERVAL_MS
    };
    this.lastTickMs = nowMs;
    this.lastSnapshotMs = nowMs;

    return {
      matchId: this.match.matchId,
      levelId: this.match.levelId,
      seed: this.match.seed,
      startAtServerMs: this.match.kickoffAt,
      racers: this.match.racers.map((racer) => ({
        id: racer.playerId,
        nickname: racer.nickname,
        characterId: racer.characterId,
        isBot: racer.isBot
      }))
    };
  }

  processAction(playerId, action, nowMs = Date.now()) {
    if (!this.match) {
      return;
    }
    const racer = this.match.racers.find((entry) => entry.playerId === playerId);
    if (!racer || racer.finishedAt) {
      return;
    }
    if (action === "jump" && racer.y === 0) {
      racer.vy = GAME_CONFIG.JUMP_VELOCITY;
      racer.state = "jump";
    } else if (action === "slide" && racer.y === 0) {
      racer.slideUntil = nowMs + GAME_CONFIG.SLIDE_MS;
      racer.state = "slide";
    }
  }

  processPower(playerId, powerType, nowMs = Date.now()) {
    if (!this.match) {
      return { success: false, reason: "match_inactive" };
    }
    const racer = this.match.racers.find((entry) => entry.playerId === playerId);
    if (!racer) {
      return { success: false, reason: "racer_not_found" };
    }
    if (racer.powerSlot !== powerType) {
      return { success: false, reason: "slot_mismatch" };
    }
    if (powerType === "hand") {
      const target = this.findNearestAheadRacer(racer);
      if (!target) {
        this.onPowerResult?.(playerId, {
          powerType,
          success: false,
          reason: "no_target"
        });
        return { success: false, reason: "no_target" };
      }
      target.x = Math.max(0, racer.x - GAME_CONFIG.HAND_PULL_DISTANCE);
      target.slowUntil = Math.max(target.slowUntil, nowMs + 1000);
      racer.powerSlot = null;
      this.onPowerResult?.(playerId, {
        powerType,
        success: true,
        targetId: target.playerId
      });
      return { success: true, targetId: target.playerId };
    }
    if (powerType === "rocket") {
      racer.rocketUntil = nowMs + GAME_CONFIG.ROCKET_DURATION_MS;
      racer.powerSlot = null;
      this.onPowerResult?.(playerId, { powerType, success: true });
      return { success: true };
    }
    if (powerType === "oil") {
      this.match.oils.push({
        id: randomUUID(),
        ownerId: racer.playerId,
        x: racer.x,
        radius: GAME_CONFIG.OIL_RADIUS,
        expiresAt: nowMs + GAME_CONFIG.OIL_DURATION_MS
      });
      racer.powerSlot = null;
      this.onPowerResult?.(playerId, { powerType, success: true });
      return { success: true };
    }
    return { success: false, reason: "power_unknown" };
  }

  tick(nowMs = Date.now()) {
    if (!this.match) {
      this.lastTickMs = nowMs;
      this.lastSnapshotMs = nowMs;
      return;
    }
    const dt = clamp((nowMs - this.lastTickMs) / 1000, 0, 0.1);
    this.lastTickMs = nowMs;
    if (nowMs < this.match.kickoffAt) {
      if (nowMs - this.lastSnapshotMs >= 1000 / GAME_CONFIG.SNAPSHOT_HZ) {
        this.lastSnapshotMs = nowMs;
        this.emitSnapshots(nowMs);
      }
      return;
    }
    this.updateRacers(nowMs, dt);
    this.updateBoxes(nowMs);
    this.match.oils = this.match.oils.filter((oil) => oil.expiresAt > nowMs);
    if (this.match.finishes.length >= GAME_CONFIG.MAX_REWARDED_RANK || nowMs >= this.match.endsAt) {
      this.finishMatch(nowMs);
      return;
    }
    if (nowMs - this.lastSnapshotMs >= 1000 / GAME_CONFIG.SNAPSHOT_HZ) {
      this.lastSnapshotMs = nowMs;
      this.emitSnapshots(nowMs);
    }
  }

  updateRacers(nowMs, dt) {
    for (const racer of this.match.racers) {
      if (racer.finishedAt) {
        continue;
      }
      if (!racer.isBot && !racer.connected && racer.disconnectedUntil && racer.disconnectedUntil <= nowMs) {
        racer.isBot = true;
        racer.connected = true;
        racer.nickname = `${racer.nickname} BOT`;
      }
      if (racer.isBot) {
        this.applyBotLogic(racer, nowMs);
      }

      if (racer.y === 0 && racer.state === "slide" && nowMs >= racer.slideUntil) {
        racer.state = "run";
      }

      let speed = GAME_CONFIG.BASE_SPEED;
      if (racer.rocketUntil > nowMs) {
        speed *= GAME_CONFIG.ROCKET_SPEED_MULTIPLIER;
      }
      if (racer.slowUntil > nowMs) {
        speed *= GAME_CONFIG.HIT_SLOW_MULTIPLIER;
      }
      const oilHit = this.match.oils.find(
        (oil) => oil.ownerId !== racer.playerId && Math.abs(oil.x - racer.x) <= oil.radius
      );
      if (oilHit) {
        speed *= GAME_CONFIG.OIL_SPEED_MULTIPLIER;
      }

      racer.x += speed * dt;
      racer.vy += GAME_CONFIG.GRAVITY * dt;
      racer.y += racer.vy * dt;
      if (racer.y <= 0) {
        racer.y = 0;
        racer.vy = 0;
        if (racer.state === "jump") {
          racer.state = nowMs < racer.slideUntil ? "slide" : "run";
        }
      }

      this.resolveHazards(racer, nowMs);
      if (racer.x >= this.match.trackLength) {
        racer.finishedAt = nowMs;
        this.match.finishes.push(racer.playerId);
      }
    }
  }

  resolveHazards(racer, nowMs) {
    for (const hazard of this.match.hazards) {
      if (racer.hazardHits.has(hazard.id)) {
        continue;
      }
      if (Math.abs(racer.x - hazard.x) > hazard.width) {
        continue;
      }
      const passJump = hazard.requires === "jump" ? racer.y >= hazard.jumpClearY : true;
      const passSlide = hazard.requires === "slide" ? racer.state === "slide" : true;
      if (!(passJump && passSlide)) {
        racer.slowUntil = Math.max(racer.slowUntil, nowMs + (hazard.penaltyMs ?? GAME_CONFIG.HIT_SLOW_MS));
      }
      racer.hazardHits.add(hazard.id);
    }
  }

  updateBoxes(nowMs) {
    if (!this.match.currentBox && nowMs >= this.match.nextBoxAt) {
      const leadX = Math.max(...this.match.racers.map((racer) => racer.x));
      const span = GAME_CONFIG.BOX_SPAWN_AHEAD_MAX - GAME_CONFIG.BOX_SPAWN_AHEAD_MIN;
      const boxX = leadX + GAME_CONFIG.BOX_SPAWN_AHEAD_MIN + Math.random() * span;
      this.match.currentBox = {
        id: randomUUID(),
        x: boxX,
        createdAt: nowMs,
        expiresAt: nowMs + GAME_CONFIG.BOX_LIFETIME_MS
      };
      this.match.nextBoxAt = nowMs + GAME_CONFIG.BOX_INTERVAL_MS;
    }
    if (!this.match.currentBox) {
      return;
    }
    const box = this.match.currentBox;
    if (nowMs >= box.expiresAt) {
      this.match.currentBox = null;
      return;
    }
    let allResolved = true;
    for (const racer of this.match.racers) {
      const alreadyHandled = racer.boxClaims.has(box.id);
      if (alreadyHandled) {
        continue;
      }
      if (racer.powerSlot) {
        if (racer.x > box.x + 4) {
          racer.boxClaims.add(box.id);
        } else {
          allResolved = false;
        }
        continue;
      }
      if (racer.x >= box.x) {
        racer.boxClaims.add(box.id);
        racer.powerSlot = pickRandomPower();
        if (!racer.isBot) {
          this.onPowerGranted?.(racer.playerId, {
            powerType: racer.powerSlot,
            sourceBoxId: box.id
          });
        }
      } else {
        allResolved = false;
      }
    }
    if (allResolved) {
      this.match.currentBox = null;
    }
  }

  findNearestAheadRacer(source) {
    let nearest = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const racer of this.match.racers) {
      if (racer.playerId === source.playerId || racer.finishedAt) {
        continue;
      }
      const distance = racer.x - source.x;
      if (distance > 0 && distance < bestDistance) {
        bestDistance = distance;
        nearest = racer;
      }
    }
    return nearest;
  }

  applyBotLogic(bot, nowMs) {
    const nextHazard = this.match.hazards
      .filter((hazard) => hazard.x > bot.x && hazard.x - bot.x < 4)
      .sort((a, b) => a.x - b.x)[0];
    if (nextHazard && bot.y === 0 && nowMs >= bot.botCooldownUntil) {
      if (nextHazard.requires === "jump" && chance(GAME_CONFIG.BOT_REACTION_CHANCE)) {
        this.processAction(bot.playerId, "jump", nowMs);
      } else if (nextHazard.requires === "slide" && chance(GAME_CONFIG.BOT_REACTION_CHANCE)) {
        this.processAction(bot.playerId, "slide", nowMs);
      }
      bot.botCooldownUntil = nowMs + 250;
    }

    if (!bot.powerSlot) {
      return;
    }
    if (bot.powerSlot === "hand") {
      const target = this.findNearestAheadRacer(bot);
      if (target && target.x - bot.x < 14 && chance(0.06)) {
        this.processPower(bot.playerId, "hand", nowMs);
      }
      return;
    }
    if (bot.powerSlot === "rocket") {
      const hazardSoon = this.match.hazards.some((hazard) => hazard.x > bot.x && hazard.x - bot.x < 8);
      if (!hazardSoon && chance(0.045)) {
        this.processPower(bot.playerId, "rocket", nowMs);
      }
      return;
    }
    if (bot.powerSlot === "oil") {
      const behind = this.match.racers.some(
        (racer) => racer.playerId !== bot.playerId && bot.x - racer.x > 0 && bot.x - racer.x < 8
      );
      if (behind && chance(0.065)) {
        this.processPower(bot.playerId, "oil", nowMs);
      }
    }
  }

  emitSnapshots(nowMs) {
    for (const racer of this.match.racers) {
      if (racer.isBot) {
        continue;
      }
      const personalBox =
        this.match.currentBox && !racer.boxClaims.has(this.match.currentBox.id) && !racer.powerSlot
          ? { id: this.match.currentBox.id, x: this.match.currentBox.x }
          : null;
      this.onSnapshot?.(racer.playerId, {
        serverMs: nowMs,
        matchId: this.match.matchId,
        levelId: this.match.levelId,
        trackLength: this.match.trackLength,
        racers: this.match.racers.map((entry) => ({
          id: entry.playerId,
          nickname: entry.nickname,
          characterId: entry.characterId,
          isBot: entry.isBot,
          x: entry.x,
          y: entry.y,
          vx: GAME_CONFIG.BASE_SPEED,
          vy: entry.vy,
          state: entry.state,
          activePower: entry.rocketUntil > nowMs ? "rocket" : null
        })),
        hazards: this.match.hazards.map((hazard) => ({
          id: hazard.id,
          x: hazard.x,
          type: hazard.type,
          requires: hazard.requires
        })),
        oils: this.match.oils.map((oil) => ({
          id: oil.id,
          x: oil.x,
          radius: oil.radius,
          ownerId: oil.ownerId
        })),
        personalBox,
        self: {
          playerId: racer.playerId,
          powerSlot: racer.powerSlot,
          rankPreview: this.computeRankPreview(racer.playerId)
        }
      });
    }
  }

  computeRankPreview(playerId) {
    const sorted = [...this.match.racers].sort((a, b) => b.x - a.x);
    const rank = sorted.findIndex((racer) => racer.playerId === playerId);
    return rank === -1 ? null : rank + 1;
  }

  finishMatch(nowMs) {
    const placements = [...this.match.racers]
      .sort((a, b) => {
        if (a.finishedAt && b.finishedAt) {
          return a.finishedAt - b.finishedAt;
        }
        if (a.finishedAt && !b.finishedAt) {
          return -1;
        }
        if (!a.finishedAt && b.finishedAt) {
          return 1;
        }
        return b.x - a.x;
      })
      .map((racer, index) => ({
        playerId: racer.playerId,
        nickname: racer.nickname,
        isBot: racer.isBot,
        rank: index + 1,
        finishMs: racer.finishedAt ?? null
      }));

    const awardedPoints = placements
      .filter((placement) => !placement.isBot && placement.rank <= GAME_CONFIG.MAX_REWARDED_RANK)
      .map((placement) => ({
        playerId: placement.playerId,
        points: GAME_CONFIG.RANK_POINTS[placement.rank] ?? 0
      }));

    const summary = {
      matchId: this.match.matchId,
      levelId: this.match.levelId,
      startedAt: this.match.startedAt,
      finishedAt: nowMs,
      placements,
      awardedPoints
    };
    this.onMatchFinish?.(summary);
    this.match = null;
  }
}
