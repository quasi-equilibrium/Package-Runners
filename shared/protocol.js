import { CHARACTER_IDS, LEVELS, POWER_TYPES } from "./constants.js";

export const EVENTS = {
  CLIENT: {
    LOBBY_JOIN: "lobby:join",
    LOBBY_SET_LEVEL: "lobby:set_level",
    LOBBY_START_MATCH: "lobby:start_match",
    LOBBY_READY_REMATCH: "lobby:ready_rematch",
    INPUT_ACTION: "input:action",
    POWER_USE: "power:use",
    SESSION_RESUME: "session:resume"
  },
  SERVER: {
    LOBBY_STATE: "lobby:state",
    MATCH_COUNTDOWN: "match:countdown",
    MATCH_START: "match:start",
    MATCH_SNAPSHOT: "match:snapshot",
    POWER_GRANTED: "power:granted",
    POWER_RESULT: "power:result",
    MATCH_FINISH: "match:finish",
    LEADERBOARD_UPDATE: "leaderboard:update",
    ERROR_EVENT: "error:event"
  }
};

export function sanitizeNickname(raw) {
  const compact = String(raw ?? "")
    .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
  if (compact.length < 3) {
    return null;
  }
  return compact;
}

export function normalizeCharacterId(raw) {
  return CHARACTER_IDS.includes(raw) ? raw : CHARACTER_IDS[0];
}

export function normalizeLevelId(raw) {
  if (!raw) {
    return "ice";
  }
  return Object.hasOwn(LEVELS, raw) ? raw : "ice";
}

export function normalizePowerType(raw) {
  return POWER_TYPES.includes(raw) ? raw : null;
}
