export const CHARACTER_IDS = [
  "doritos_like",
  "cheetos_like",
  "pringles_like",
  "biskrem_like"
];

export const CHARACTERS = {
  doritos_like: {
    id: "doritos_like",
    name: "Ucgen Cips",
    colorA: "#e63900",
    colorB: "#ffb703",
    shape: "tri-pack",
    legScale: 1
  },
  cheetos_like: {
    id: "cheetos_like",
    name: "Citir Paket",
    colorA: "#ff7b00",
    colorB: "#fcbf49",
    shape: "soft-pack",
    legScale: 1
  },
  pringles_like: {
    id: "pringles_like",
    name: "Tup Kutu",
    colorA: "#d7263d",
    colorB: "#1f2937",
    shape: "tube",
    legScale: 1
  },
  biskrem_like: {
    id: "biskrem_like",
    name: "Yatay Biskuvi",
    colorA: "#7a4a2d",
    colorB: "#f2c078",
    shape: "horizontal-pack",
    legScale: 1.45
  }
};

export const POWER_TYPES = ["hand", "rocket", "oil"];

export const POWER_META = {
  hand: { id: "hand", name: "El", icon: "FIST" },
  rocket: { id: "rocket", name: "Havai Fisek", icon: "ROCKET" },
  oil: { id: "oil", name: "Yag", icon: "OIL" }
};

export const GAME_CONFIG = {
  MAX_PLAYERS: 4,
  MAX_HUMANS_IN_LOBBY: 4,
  MAX_REWARDED_RANK: 3,
  RANK_POINTS: { 1: 5, 2: 3, 3: 1 },
  SERVER_TICK_HZ: 30,
  SNAPSHOT_HZ: 20,
  TRACK_LENGTH: 900,
  BASE_SPEED: 10,
  JUMP_VELOCITY: 17,
  GRAVITY: -47,
  SLIDE_MS: 800,
  BOX_INTERVAL_MS: 3000,
  BOX_LIFETIME_MS: 5500,
  BOX_SPAWN_AHEAD_MIN: 24,
  BOX_SPAWN_AHEAD_MAX: 40,
  OIL_DURATION_MS: 10000,
  OIL_RADIUS: 4.2,
  OIL_SPEED_MULTIPLIER: 0.2,
  ROCKET_DURATION_MS: 3000,
  ROCKET_SPEED_MULTIPLIER: 2,
  HAND_PULL_DISTANCE: 8,
  HIT_SLOW_MULTIPLIER: 0.45,
  HIT_SLOW_MS: 1600,
  MATCH_TIME_LIMIT_MS: 95000,
  RECONNECT_GRACE_MS: 20000,
  REMATCH_COUNTDOWN_MS: 20000,
  BOT_REACTION_CHANCE: 0.9
};

export const LEVELS = {
  ice: {
    id: "ice",
    label: "Buz",
    sky: ["#9bd8ff", "#dff3ff"],
    ground: "#cbefff",
    accent: "#5ec2ff",
    obstacles: [
      { id: "ice_arch_1", x: 110, type: "ice_arch", requires: "slide", penaltyMs: 1650, width: 2.5, jumpClearY: 2.1 },
      { id: "icicle_1", x: 190, type: "icicle_drop", requires: "jump", penaltyMs: 1650, width: 2.2, jumpClearY: 2.2 },
      { id: "ice_arch_2", x: 270, type: "ice_arch", requires: "slide", penaltyMs: 1650, width: 2.5, jumpClearY: 2.1 },
      { id: "fragile_1", x: 355, type: "fragile_gap", requires: "jump", penaltyMs: 1800, width: 2.7, jumpClearY: 2.3 },
      { id: "icicle_2", x: 465, type: "icicle_drop", requires: "jump", penaltyMs: 1650, width: 2.2, jumpClearY: 2.2 },
      { id: "ice_arch_3", x: 570, type: "ice_arch", requires: "slide", penaltyMs: 1650, width: 2.5, jumpClearY: 2.1 },
      { id: "fragile_2", x: 690, type: "fragile_gap", requires: "jump", penaltyMs: 1800, width: 2.7, jumpClearY: 2.3 },
      { id: "icicle_3", x: 810, type: "icicle_drop", requires: "jump", penaltyMs: 1650, width: 2.2, jumpClearY: 2.2 }
    ]
  },
  desert: {
    id: "desert",
    label: "Col",
    sky: ["#ffd590", "#fff2cf"],
    ground: "#f5c26b",
    accent: "#d19031",
    obstacles: [
      { id: "cactus_1", x: 120, type: "cactus_wall", requires: "jump", penaltyMs: 1650, width: 2.3, jumpClearY: 2.2 },
      { id: "tumble_1", x: 205, type: "tumbleweed", requires: "slide", penaltyMs: 1550, width: 2.5, jumpClearY: 2.1 },
      { id: "sand_1", x: 305, type: "sand_pocket", requires: "jump", penaltyMs: 1750, width: 2.4, jumpClearY: 2.3 },
      { id: "cactus_2", x: 420, type: "cactus_wall", requires: "jump", penaltyMs: 1650, width: 2.3, jumpClearY: 2.2 },
      { id: "storm_1", x: 510, type: "sand_storm", requires: "slide", penaltyMs: 1600, width: 2.5, jumpClearY: 2.1 },
      { id: "sand_2", x: 625, type: "sand_pocket", requires: "jump", penaltyMs: 1750, width: 2.4, jumpClearY: 2.3 },
      { id: "tumble_2", x: 740, type: "tumbleweed", requires: "slide", penaltyMs: 1550, width: 2.5, jumpClearY: 2.1 },
      { id: "cactus_3", x: 845, type: "cactus_wall", requires: "jump", penaltyMs: 1650, width: 2.3, jumpClearY: 2.2 }
    ]
  },
  neon: {
    id: "neon",
    label: "Gece Neon",
    sky: ["#06080f", "#1c2044"],
    ground: "#242744",
    accent: "#00e5ff",
    obstacles: [
      { id: "laser_1", x: 130, type: "laser_gate", requires: "slide", penaltyMs: 1700, width: 2.5, jumpClearY: 2.1 },
      { id: "shock_1", x: 220, type: "shock_strip", requires: "jump", penaltyMs: 1750, width: 2.2, jumpClearY: 2.2 },
      { id: "barrier_1", x: 320, type: "neon_barrier", requires: "jump", penaltyMs: 1650, width: 2.4, jumpClearY: 2.2 },
      { id: "laser_2", x: 430, type: "laser_gate", requires: "slide", penaltyMs: 1700, width: 2.5, jumpClearY: 2.1 },
      { id: "shock_2", x: 545, type: "shock_strip", requires: "jump", penaltyMs: 1750, width: 2.2, jumpClearY: 2.2 },
      { id: "barrier_2", x: 650, type: "neon_barrier", requires: "jump", penaltyMs: 1650, width: 2.4, jumpClearY: 2.2 },
      { id: "laser_3", x: 760, type: "laser_gate", requires: "slide", penaltyMs: 1700, width: 2.5, jumpClearY: 2.1 },
      { id: "shock_3", x: 860, type: "shock_strip", requires: "jump", penaltyMs: 1750, width: 2.2, jumpClearY: 2.2 }
    ]
  }
};

export const LEVEL_ORDER = ["ice", "desert", "neon"];
