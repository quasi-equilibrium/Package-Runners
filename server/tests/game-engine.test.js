import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../game-engine.js";
import { GAME_CONFIG } from "../../shared/constants.js";

function createEngine() {
  return new GameEngine({
    onPowerGranted: () => {},
    onPowerResult: () => {},
    onMatchFinish: () => {},
    onSnapshot: () => {}
  });
}

test("startMatch fills missing players with bots", () => {
  const engine = createEngine();
  const payload = engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "human-1", nickname: "Oyuncu1", characterId: "doritos_like" }],
    nowMs: 1000
  });
  assert.equal(payload.racers.length, 4);
  const bots = payload.racers.filter((racer) => racer.isBot);
  assert.equal(bots.length, 3);
});

test("hand power does not consume slot if no target ahead", () => {
  const engine = createEngine();
  engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "solo", nickname: "Solo", characterId: "doritos_like" }],
    nowMs: 1000
  });
  const racer = engine.match.racers.find((entry) => entry.playerId === "solo");
  racer.powerSlot = "hand";
  const result = engine.processPower("solo", "hand", 1200);
  assert.equal(result.success, false);
  assert.equal(racer.powerSlot, "hand");
});

test("rocket power lasts 3 seconds", () => {
  const engine = createEngine();
  engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "p1", nickname: "P1", characterId: "doritos_like" }],
    nowMs: 1000
  });
  const racer = engine.match.racers.find((entry) => entry.playerId === "p1");
  racer.powerSlot = "rocket";
  const result = engine.processPower("p1", "rocket", 5000);
  assert.equal(result.success, true);
  assert.equal(racer.rocketUntil, 5000 + GAME_CONFIG.ROCKET_DURATION_MS);
});

test("oil power creates 10-second puddle", () => {
  const engine = createEngine();
  engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "p1", nickname: "P1", characterId: "doritos_like" }],
    nowMs: 1000
  });
  const racer = engine.match.racers.find((entry) => entry.playerId === "p1");
  racer.powerSlot = "oil";
  const result = engine.processPower("p1", "oil", 8000);
  assert.equal(result.success, true);
  assert.equal(engine.match.oils.length, 1);
  assert.equal(engine.match.oils[0].expiresAt, 8000 + GAME_CONFIG.OIL_DURATION_MS);
});

test("slot full does not replace existing item on box touch", () => {
  const engine = createEngine();
  engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "p1", nickname: "P1", characterId: "doritos_like" }],
    nowMs: 1000
  });
  const racer = engine.match.racers.find((entry) => entry.playerId === "p1");
  racer.powerSlot = "hand";
  racer.x = 8;
  engine.match.currentBox = {
    id: "box-1",
    x: 1,
    createdAt: 1000,
    expiresAt: 8000
  };
  engine.tick(4000);
  assert.equal(racer.powerSlot, "hand");
  assert.equal(racer.boxClaims.has("box-1"), true);
});

test("disconnected racer turns bot after reconnect grace", () => {
  const engine = createEngine();
  engine.startMatch({
    levelId: "ice",
    humans: [{ playerId: "p1", nickname: "P1", characterId: "doritos_like" }],
    nowMs: 1000
  });
  engine.markDisconnected("p1");
  const racerBefore = engine.match.racers.find((entry) => entry.playerId === "p1");
  racerBefore.disconnectedUntil = 2000;
  engine.tick(5000);
  const racer = engine.match.racers.find((entry) => entry.playerId === "p1");
  assert.equal(racer.isBot, true);
});
