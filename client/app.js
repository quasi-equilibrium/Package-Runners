import { LEVELS, POWER_META } from "../shared/constants.js";
import { EVENTS } from "../shared/protocol.js";
import { NetClient } from "./net.js";
import { GameRenderer } from "./renderer.js";
import { AudioManager } from "./audio.js";

const state = {
  sessionToken: localStorage.getItem("pr_session_token") ?? null,
  playerId: null,
  nickname: localStorage.getItem("pr_nickname") ?? "",
  characterId: localStorage.getItem("pr_character") ?? "doritos_like",
  selectedLevel: "ice",
  lobbyState: null,
  powerSlot: null,
  leaderboard: [],
  matchStartedAtMs: null
};

const els = {
  joinScreen: document.querySelector("#joinScreen"),
  lobbyScreen: document.querySelector("#lobbyScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  resultScreen: document.querySelector("#resultScreen"),
  nicknameInput: document.querySelector("#nicknameInput"),
  joinBtn: document.querySelector("#joinBtn"),
  joinError: document.querySelector("#joinError"),
  characterGrid: document.querySelector("#characterGrid"),
  levelButtons: document.querySelector("#levelButtons"),
  playerList: document.querySelector("#playerList"),
  queueInfo: document.querySelector("#queueInfo"),
  lobbyStateText: document.querySelector("#lobbyStateText"),
  startBtn: document.querySelector("#startBtn"),
  upBtn: document.querySelector("#upBtn"),
  downBtn: document.querySelector("#downBtn"),
  powerBtn: document.querySelector("#powerBtn"),
  hudRank: document.querySelector("#hudRank"),
  hudLevel: document.querySelector("#hudLevel"),
  hudTime: document.querySelector("#hudTime"),
  resultList: document.querySelector("#resultList"),
  leaderboardList: document.querySelector("#leaderboardList"),
  readyBtn: document.querySelector("#readyBtn"),
  gameCanvas: document.querySelector("#gameCanvas")
};

const audio = new AudioManager();
const renderer = new GameRenderer(els.gameCanvas);
const net = new NetClient(resolveServerUrl());
net.connect();

initUI();
bindSocket();
openScreen("join");

function resolveServerUrl() {
  const explicit = new URLSearchParams(window.location.search).get("server");
  if (explicit) {
    return explicit;
  }
  return window.location.origin;
}

function initUI() {
  els.nicknameInput.value = state.nickname;
  selectCharacter(state.characterId);

  els.characterGrid.addEventListener("click", (event) => {
    const target = event.target.closest(".character-card");
    if (!target) {
      return;
    }
    selectCharacter(target.dataset.char);
  });

  els.levelButtons.addEventListener("click", async (event) => {
    const target = event.target.closest(".level-btn");
    if (!target) {
      return;
    }
    state.selectedLevel = target.dataset.level;
    paintLevelSelection(state.selectedLevel);
    if (isLeader()) {
      await net.setLevel(state.selectedLevel);
    }
  });

  els.joinBtn.addEventListener("click", joinLobby);
  els.startBtn.addEventListener("click", startMatch);

  const triggerJump = (event) => {
    event.preventDefault();
    net.sendAction("jump");
    audio.playJump();
  };
  const triggerSlide = (event) => {
    event.preventDefault();
    net.sendAction("slide");
    audio.playSlide();
  };
  els.upBtn.addEventListener("pointerdown", triggerJump);
  els.downBtn.addEventListener("pointerdown", triggerSlide);

  els.powerBtn.addEventListener("pointerdown", async (event) => {
    event.preventDefault();
    if (!state.powerSlot) {
      return;
    }
    const used = state.powerSlot;
    const response = await net.usePower(used);
    if (response?.ok) {
      audio.playPower(used);
    }
  });

  els.readyBtn.addEventListener("click", async () => {
    await net.readyRematch();
    openScreen("lobby");
  });

  const unlock = () => {
    audio.ensureContext();
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
}

function bindSocket() {
  net.addEventListener("connect", () => {
    if (!state.sessionToken) {
      return;
    }
    const nickname = state.nickname || els.nicknameInput.value.trim();
    if (nickname.length < 3) {
      return;
    }
    net.join({
      sessionToken: state.sessionToken,
      nickname,
      characterId: state.characterId
    });
  });

  net.addEventListener(EVENTS.SERVER.LOBBY_STATE, (event) => {
    state.lobbyState = event.detail;
    if (event.detail?.selectedLevel) {
      state.selectedLevel = event.detail.selectedLevel;
      paintLevelSelection(state.selectedLevel);
    }
    updateLobbyUI();
    if (event.detail?.selfStatus === "queue" || event.detail?.selfStatus === "lobby") {
      if (!isScreen("result")) {
        openScreen("lobby");
      }
    }
  });

  net.addEventListener(EVENTS.SERVER.MATCH_START, (event) => {
    const payload = event.detail;
    state.matchStartedAtMs = payload.startAtServerMs;
    state.powerSlot = null;
    els.powerBtn.textContent = "?";
    els.hudLevel.textContent = `Level: ${LEVELS[payload.levelId]?.label ?? payload.levelId}`;
    renderer.start(payload, state.playerId);
    audio.startMusic(payload.levelId);
    openScreen("game");
  });

  net.addEventListener(EVENTS.SERVER.MATCH_COUNTDOWN, (event) => {
    const payload = event.detail;
    if (!payload?.startAtServerMs) {
      return;
    }
    const remainingMs = Math.max(0, payload.startAtServerMs - Date.now());
    const seconds = (remainingMs / 1000).toFixed(1);
    els.lobbyStateText.textContent = `Mac ${seconds} sn sonra basliyor...`;
  });

  net.addEventListener(EVENTS.SERVER.MATCH_SNAPSHOT, (event) => {
    const snapshot = event.detail;
    renderer.pushSnapshot(snapshot);
    state.powerSlot = snapshot?.self?.powerSlot ?? null;
    els.powerBtn.textContent = state.powerSlot ? POWER_META[state.powerSlot]?.name ?? "Power" : "?";
    if (snapshot?.self?.rankPreview) {
      els.hudRank.textContent = `Sira: ${snapshot.self.rankPreview}`;
    }
    if (state.matchStartedAtMs) {
      const elapsed = Math.max(0, Math.floor((snapshot.serverMs - state.matchStartedAtMs) / 1000));
      const min = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const sec = String(elapsed % 60).padStart(2, "0");
      els.hudTime.textContent = `${min}:${sec}`;
    }
  });

  net.addEventListener(EVENTS.SERVER.POWER_GRANTED, (event) => {
    const powerType = event.detail?.powerType;
    if (!powerType) {
      return;
    }
    state.powerSlot = powerType;
    els.powerBtn.textContent = POWER_META[powerType]?.name ?? powerType;
  });

  net.addEventListener(EVENTS.SERVER.POWER_RESULT, (event) => {
    const result = event.detail;
    if (result?.success) {
      state.powerSlot = null;
      els.powerBtn.textContent = "?";
      audio.playPower(result.powerType);
    } else if (result?.reason === "no_target") {
      els.powerBtn.classList.add("shake");
      setTimeout(() => els.powerBtn.classList.remove("shake"), 220);
    }
  });

  net.addEventListener(EVENTS.SERVER.MATCH_FINISH, (event) => {
    const payload = event.detail;
    audio.stopMusic();
    audio.playFinish();
    renderResult(payload);
    openScreen("result");
  });

  net.addEventListener(EVENTS.SERVER.LEADERBOARD_UPDATE, (event) => {
    state.leaderboard = event.detail ?? [];
    renderLeaderboard();
  });

  net.addEventListener(EVENTS.SERVER.ERROR_EVENT, (event) => {
    const message = event.detail?.message ?? "Baglanti hatasi";
    els.joinError.textContent = message;
  });
}

async function joinLobby() {
  const nickname = els.nicknameInput.value.trim();
  if (nickname.length < 3) {
    els.joinError.textContent = "Isim en az 3 karakter olmali.";
    return;
  }
  els.joinError.textContent = "";
  const response = await net.join({
    nickname,
    characterId: state.characterId,
    sessionToken: state.sessionToken
  });
  if (!response?.ok) {
    els.joinError.textContent = `Lobiye girilemedi: ${response?.reason ?? "bilinmeyen_hata"}`;
    return;
  }
  state.sessionToken = response.sessionToken;
  state.playerId = response.playerId;
  state.nickname = nickname;
  localStorage.setItem("pr_session_token", state.sessionToken);
  localStorage.setItem("pr_nickname", nickname);
  localStorage.setItem("pr_character", state.characterId);
  openScreen("lobby");
}

async function startMatch() {
  if (!isLeader()) {
    return;
  }
  const result = await net.startMatch(state.selectedLevel);
  if (!result?.ok) {
    els.joinError.textContent = `Mac baslatilamadi: ${result?.reason ?? "hata"}`;
  }
}

function renderResult(payload) {
  els.resultList.innerHTML = "";
  for (const placement of payload.placements ?? []) {
    const item = document.createElement("li");
    const rankText = `${placement.rank}. ${placement.nickname}${placement.isBot ? " (BOT)" : ""}`;
    item.textContent = rankText;
    if (placement.playerId === state.playerId) {
      item.style.color = "#ffb703";
      item.style.fontWeight = "900";
    }
    els.resultList.appendChild(item);
  }
  renderLeaderboard();
}

function renderLeaderboard() {
  els.leaderboardList.innerHTML = "";
  for (const row of state.leaderboard.slice(0, 10)) {
    const item = document.createElement("li");
    item.textContent = `${row.nickname} - ${row.pointsTotal} puan (W:${row.wins})`;
    if (row.playerId === state.playerId) {
      item.style.color = "#48d08b";
      item.style.fontWeight = "900";
    }
    els.leaderboardList.appendChild(item);
  }
}

function updateLobbyUI() {
  const lobby = state.lobbyState;
  if (!lobby) {
    return;
  }
  els.playerList.innerHTML = "";
  for (const player of lobby.players) {
    const item = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = player.nickname;
    const right = document.createElement("span");
    right.textContent = player.isLeader ? "Lider" : "Oyuncu";
    if (player.isLeader) {
      right.classList.add("player-leader");
    }
    item.append(left, right);
    els.playerList.appendChild(item);
  }
  const queueText = lobby.queueCount > 0 ? `Sira bekleyen: ${lobby.queueCount}` : "Sira bos";
  els.queueInfo.textContent = queueText;
  const remaining = lobby.rematchDeadlineMs ? Math.max(0, Math.ceil((lobby.rematchDeadlineMs - Date.now()) / 1000)) : null;
  const stateLine = lobby.inMatch
    ? "Mac devam ediyor. Sonraki maca alinacaksin."
    : remaining
      ? `Yeni mac ${remaining} sn sonra otomatik baslayacak.`
      : "Maca hazir.";
  els.lobbyStateText.textContent = stateLine;

  const leader = isLeader();
  els.startBtn.disabled = !leader || lobby.inMatch;
  els.startBtn.textContent = leader ? "Maci Baslat" : "Sadece lider baslatabilir";
  paintLevelSelection(state.selectedLevel);
}

function paintLevelSelection(selectedLevel) {
  for (const button of els.levelButtons.querySelectorAll(".level-btn")) {
    button.classList.toggle("level-selected", button.dataset.level === selectedLevel);
    if (!isLeader()) {
      button.setAttribute("disabled", "disabled");
    } else {
      button.removeAttribute("disabled");
    }
  }
}

function selectCharacter(characterId) {
  state.characterId = characterId;
  for (const card of els.characterGrid.querySelectorAll(".character-card")) {
    card.classList.toggle("selected", card.dataset.char === characterId);
  }
}

function isLeader() {
  return state.lobbyState?.leaderPlayerId === state.playerId;
}

function openScreen(name) {
  const mapping = {
    join: els.joinScreen,
    lobby: els.lobbyScreen,
    game: els.gameScreen,
    result: els.resultScreen
  };
  Object.values(mapping).forEach((screen) => {
    screen.classList.remove("screen-visible");
  });
  const active = mapping[name];
  active.classList.add("screen-visible");
}

function isScreen(name) {
  const mapping = {
    join: els.joinScreen,
    lobby: els.lobbyScreen,
    game: els.gameScreen,
    result: els.resultScreen
  };
  return mapping[name].classList.contains("screen-visible");
}
