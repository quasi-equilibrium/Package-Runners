import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "socket.io";
import { Database } from "./db.js";
import { GameEngine } from "./game-engine.js";
import { EVENTS, normalizeCharacterId, normalizeLevelId, normalizePowerType, sanitizeNickname } from "../shared/protocol.js";
import { GAME_CONFIG, LEVEL_ORDER } from "../shared/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const port = Number(process.env.PORT ?? 3000);
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((entry) => entry.trim()) : "*";

const app = express();
app.use(express.json());
app.use("/client", express.static(path.join(rootDir, "client")));
app.use("/shared", express.static(path.join(rootDir, "shared")));
app.use(express.static(rootDir));

const db = new Database();
await db.init();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: false
  }
});

const participants = new Map();
const socketToToken = new Map();
let waitingOrder = [];
let activeMatchTokens = [];
let selectedLevel = LEVEL_ORDER[0];
let rematchDeadline = null;
let rematchTimer = null;
let matchStartTimer = null;

const engine = new GameEngine({
  onPowerGranted: (playerId, payload) => emitToPlayer(playerId, EVENTS.SERVER.POWER_GRANTED, payload),
  onPowerResult: (playerId, payload) => emitToPlayer(playerId, EVENTS.SERVER.POWER_RESULT, payload),
  onSnapshot: (playerId, payload) => emitToPlayer(playerId, EVENTS.SERVER.MATCH_SNAPSHOT, payload),
  onMatchFinish: async (summary) => {
    if (matchStartTimer) {
      clearTimeout(matchStartTimer);
      matchStartTimer = null;
    }
    await db.recordMatchResult(summary);
    const leaderboard = await db.getLeaderboard(20);
    io.emit(EVENTS.SERVER.LEADERBOARD_UPDATE, leaderboard);

    for (const token of activeMatchTokens) {
      const player = participants.get(token);
      if (!player) {
        continue;
      }
      player.status = player.connected ? "lobby" : "offline";
    }

    const activeHumans = activeMatchTokens.filter((token) => {
      const player = participants.get(token);
      return Boolean(player?.connected);
    });
    waitingOrder = dedupeTokens([...activeHumans, ...waitingOrder]);
    activeMatchTokens = [];

    for (const player of participants.values()) {
      if (!player.socketId) {
        continue;
      }
      io.to(player.socketId).emit(EVENTS.SERVER.MATCH_FINISH, {
        matchId: summary.matchId,
        placements: summary.placements,
        awardedPoints: summary.awardedPoints
      });
    }

    broadcastLobbyState();
    startRematchCountdown();
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    inMatch: engine.isRunning,
    lobbyCount: getLobbyTokens().length,
    queueCount: getQueueTokens().length
  });
});

app.get("/api/leaderboard", async (_req, res) => {
  res.json(await db.getLeaderboard(20));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(rootDir, "client", "index.html"));
});

function dedupeTokens(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    if (!participants.has(token)) {
      continue;
    }
    seen.add(token);
    out.push(token);
  }
  return out;
}

function pruneWaiting() {
  waitingOrder = waitingOrder.filter((token) => {
    const player = participants.get(token);
    return Boolean(player?.connected);
  });
}

function getLobbyTokens() {
  pruneWaiting();
  return waitingOrder.slice(0, GAME_CONFIG.MAX_HUMANS_IN_LOBBY);
}

function getQueueTokens() {
  pruneWaiting();
  return waitingOrder.slice(GAME_CONFIG.MAX_HUMANS_IN_LOBBY);
}

function getLeaderToken() {
  return getLobbyTokens()[0] ?? null;
}

function emitToPlayer(playerId, eventName, payload) {
  const player = participants.get(playerId);
  if (!player?.socketId) {
    return;
  }
  io.to(player.socketId).emit(eventName, payload);
}

function buildLobbyState(forToken = null) {
  const lobbyTokens = getLobbyTokens();
  const leaderToken = lobbyTokens[0] ?? null;
  const players = lobbyTokens.map((token) => {
    const row = participants.get(token);
    return {
      playerId: row.sessionToken,
      nickname: row.nickname,
      characterId: row.characterId,
      connected: row.connected,
      isLeader: token === leaderToken
    };
  });
  return {
    leaderPlayerId: leaderToken,
    players,
    queueCount: getQueueTokens().length,
    inMatch: engine.isRunning,
    selectedLevel,
    rematchDeadlineMs: rematchDeadline,
    selfStatus: forToken
      ? activeMatchTokens.includes(forToken)
        ? "match"
        : getLobbyTokens().includes(forToken)
          ? "lobby"
          : getQueueTokens().includes(forToken)
            ? "queue"
            : "offline"
      : null
  };
}

function broadcastLobbyState() {
  for (const player of participants.values()) {
    if (!player.socketId) {
      continue;
    }
    io.to(player.socketId).emit(EVENTS.SERVER.LOBBY_STATE, buildLobbyState(player.sessionToken));
  }
}

async function joinParticipant(socket, payload = {}) {
  const nickname = sanitizeNickname(payload.nickname);
  if (!nickname) {
    return { ok: false, reason: "nickname_invalid" };
  }
  const characterId = normalizeCharacterId(payload.characterId);
  const token =
    typeof payload.sessionToken === "string" && payload.sessionToken.trim().length > 10
      ? payload.sessionToken.trim()
      : randomUUID();

  let player = participants.get(token);
  if (!player) {
    player = {
      sessionToken: token,
      nickname,
      characterId,
      socketId: socket.id,
      connected: true,
      status: "lobby",
      createdAt: Date.now()
    };
    participants.set(token, player);
  } else {
    if (player.socketId && player.socketId !== socket.id) {
      io.to(player.socketId).emit(EVENTS.SERVER.ERROR_EVENT, { message: "Yeni oturum acildi." });
      const oldSocket = io.sockets.sockets.get(player.socketId);
      oldSocket?.disconnect(true);
    }
    player.nickname = nickname;
    player.characterId = characterId;
    player.socketId = socket.id;
    player.connected = true;
  }

  socketToToken.set(socket.id, token);
  await db.upsertPlayer(token, nickname, characterId);

  const resumedInMatch = engine.canResume(token);
  if (resumedInMatch) {
    engine.resumePlayer(token);
    player.status = "match";
    if (!activeMatchTokens.includes(token)) {
      activeMatchTokens.push(token);
    }
  } else {
    if (activeMatchTokens.includes(token) && !engine.hasPlayer(token)) {
      activeMatchTokens = activeMatchTokens.filter((entry) => entry !== token);
    }
    if (!activeMatchTokens.includes(token) && !waitingOrder.includes(token)) {
      waitingOrder.push(token);
      player.status = "queue";
    }
  }

  waitingOrder = dedupeTokens(waitingOrder);
  broadcastLobbyState();
  const leaderboard = await db.getLeaderboard(20);
  emitToPlayer(token, EVENTS.SERVER.LEADERBOARD_UPDATE, leaderboard);

  return {
    ok: true,
    sessionToken: token,
    playerId: token,
    resumedInMatch
  };
}

function startMatch() {
  if (engine.isRunning) {
    return { ok: false, reason: "already_running" };
  }
  const lobbyTokens = getLobbyTokens();
  if (lobbyTokens.length === 0) {
    return { ok: false, reason: "no_players" };
  }

  activeMatchTokens = [...lobbyTokens];
  waitingOrder = waitingOrder.filter((token) => !activeMatchTokens.includes(token));
  for (const token of activeMatchTokens) {
    const row = participants.get(token);
    if (row) {
      row.status = "match";
    }
  }
  clearRematchCountdown();

  const humans = activeMatchTokens
    .map((token) => participants.get(token))
    .filter(Boolean)
    .map((row) => ({
      playerId: row.sessionToken,
      nickname: row.nickname,
      characterId: row.characterId
    }));

  const payload = engine.startMatch({
    levelId: selectedLevel,
    humans
  });

  if (matchStartTimer) {
    clearTimeout(matchStartTimer);
    matchStartTimer = null;
  }
  for (const token of activeMatchTokens) {
    emitToPlayer(token, EVENTS.SERVER.MATCH_COUNTDOWN, {
      matchId: payload.matchId,
      levelId: payload.levelId,
      startAtServerMs: payload.startAtServerMs
    });
  }
  const delayMs = Math.max(0, payload.startAtServerMs - Date.now());
  matchStartTimer = setTimeout(() => {
    if (!engine.isRunning || engine.match?.matchId !== payload.matchId) {
      return;
    }
    for (const token of activeMatchTokens) {
      emitToPlayer(token, EVENTS.SERVER.MATCH_START, payload);
    }
  }, delayMs);
  broadcastLobbyState();
  return { ok: true, payload };
}

function clearRematchCountdown() {
  rematchDeadline = null;
  if (rematchTimer) {
    clearInterval(rematchTimer);
    rematchTimer = null;
  }
}

function startRematchCountdown() {
  clearRematchCountdown();
  rematchDeadline = Date.now() + GAME_CONFIG.REMATCH_COUNTDOWN_MS;
  rematchTimer = setInterval(() => {
    if (engine.isRunning) {
      clearRematchCountdown();
      return;
    }
    if (!rematchDeadline) {
      clearRematchCountdown();
      return;
    }
    if (Date.now() >= rematchDeadline) {
      clearRematchCountdown();
      if (getLobbyTokens().length > 0) {
        startMatch();
      } else {
        broadcastLobbyState();
      }
      return;
    }
    broadcastLobbyState();
  }, 1000);
  broadcastLobbyState();
}

io.on("connection", (socket) => {
  socket.on(EVENTS.CLIENT.LOBBY_JOIN, async (payload, ack) => {
    const result = await joinParticipant(socket, payload ?? {});
    ack?.(result);
  });

  socket.on(EVENTS.CLIENT.SESSION_RESUME, async (payload, ack) => {
    const token = typeof payload?.sessionToken === "string" ? payload.sessionToken : null;
    if (!token || !participants.has(token)) {
      ack?.({ ok: false, reason: "session_missing" });
      return;
    }
    const player = participants.get(token);
    const result = await joinParticipant(socket, {
      sessionToken: token,
      nickname: player.nickname,
      characterId: player.characterId
    });
    ack?.(result);
  });

  socket.on(EVENTS.CLIENT.LOBBY_SET_LEVEL, (payload, ack) => {
    const token = socketToToken.get(socket.id);
    if (!token) {
      ack?.({ ok: false, reason: "unauthorized" });
      return;
    }
    if (token !== getLeaderToken()) {
      ack?.({ ok: false, reason: "not_leader" });
      return;
    }
    selectedLevel = normalizeLevelId(payload?.levelId);
    broadcastLobbyState();
    ack?.({ ok: true, selectedLevel });
  });

  socket.on(EVENTS.CLIENT.LOBBY_START_MATCH, (payload, ack) => {
    const token = socketToToken.get(socket.id);
    if (!token) {
      ack?.({ ok: false, reason: "unauthorized" });
      return;
    }
    if (token !== getLeaderToken()) {
      ack?.({ ok: false, reason: "not_leader" });
      return;
    }
    if (payload?.levelId) {
      selectedLevel = normalizeLevelId(payload.levelId);
    }
    const result = startMatch();
    if (!result.ok) {
      ack?.(result);
      return;
    }
    ack?.({
      ok: true,
      matchId: result.payload.matchId
    });
  });

  socket.on(EVENTS.CLIENT.INPUT_ACTION, (payload) => {
    const token = socketToToken.get(socket.id);
    if (!token || !engine.isRunning || !activeMatchTokens.includes(token)) {
      return;
    }
    if (payload?.action !== "jump" && payload?.action !== "slide") {
      return;
    }
    engine.processAction(token, payload.action, Date.now());
  });

  socket.on(EVENTS.CLIENT.POWER_USE, (payload, ack) => {
    const token = socketToToken.get(socket.id);
    if (!token || !engine.isRunning || !activeMatchTokens.includes(token)) {
      ack?.({ ok: false, reason: "not_active" });
      return;
    }
    const powerType = normalizePowerType(payload?.powerType);
    if (!powerType) {
      ack?.({ ok: false, reason: "power_invalid" });
      return;
    }
    const result = engine.processPower(token, powerType, Date.now());
    ack?.({ ok: Boolean(result?.success), ...result });
  });

  socket.on(EVENTS.CLIENT.LOBBY_READY_REMATCH, (_payload, ack) => {
    const token = socketToToken.get(socket.id);
    if (!token) {
      ack?.({ ok: false, reason: "unauthorized" });
      return;
    }
    if (!rematchDeadline) {
      ack?.({ ok: false, reason: "no_countdown" });
      return;
    }
    const player = participants.get(token);
    if (!player) {
      ack?.({ ok: false, reason: "unknown_player" });
      return;
    }
    player.readyRematch = true;
    const lobbyTokens = getLobbyTokens();
    const everyoneReady = lobbyTokens.length > 0 && lobbyTokens.every((entry) => participants.get(entry)?.readyRematch);
    if (everyoneReady && !engine.isRunning) {
      for (const entry of lobbyTokens) {
        participants.get(entry).readyRematch = false;
      }
      startMatch();
    }
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const token = socketToToken.get(socket.id);
    socketToToken.delete(socket.id);
    if (!token) {
      return;
    }
    const player = participants.get(token);
    if (!player) {
      return;
    }
    if (player.socketId === socket.id) {
      player.socketId = null;
    }
    player.connected = false;

    if (activeMatchTokens.includes(token) && engine.isRunning) {
      engine.markDisconnected(token);
      player.status = "match";
      broadcastLobbyState();
      return;
    }

    waitingOrder = waitingOrder.filter((entry) => entry !== token);
    player.status = "offline";
    broadcastLobbyState();

    setTimeout(() => {
      const current = participants.get(token);
      if (!current || current.connected) {
        return;
      }
      participants.delete(token);
      waitingOrder = waitingOrder.filter((entry) => entry !== token);
      broadcastLobbyState();
    }, GAME_CONFIG.RECONNECT_GRACE_MS);
  });
});

setInterval(() => {
  engine.tick(Date.now());
  if (!engine.isRunning && activeMatchTokens.length > 0) {
    activeMatchTokens = activeMatchTokens.filter((token) => participants.get(token)?.connected);
  }
  if (engine.isRunning) {
    activeMatchTokens = activeMatchTokens.filter((token) => engine.hasPlayer(token));
  }
}, Math.round(1000 / GAME_CONFIG.SERVER_TICK_HZ));

server.listen(port, () => {
  console.log(`Package Runners server listening on http://localhost:${port}`);
});
