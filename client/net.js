import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";
import { EVENTS } from "../shared/protocol.js";

export class NetClient extends EventTarget {
  constructor(serverUrl) {
    super();
    this.serverUrl = serverUrl;
    this.socket = null;
  }

  connect() {
    if (this.socket) {
      return;
    }
    this.socket = io(this.serverUrl, {
      transports: ["websocket"],
      autoConnect: true
    });
    this.socket.on("connect", () => this.dispatch("connect"));
    this.socket.on("disconnect", () => this.dispatch("disconnect"));
    this.socket.on(EVENTS.SERVER.LOBBY_STATE, (payload) => this.dispatch(EVENTS.SERVER.LOBBY_STATE, payload));
    this.socket.on(EVENTS.SERVER.MATCH_COUNTDOWN, (payload) => this.dispatch(EVENTS.SERVER.MATCH_COUNTDOWN, payload));
    this.socket.on(EVENTS.SERVER.MATCH_START, (payload) => this.dispatch(EVENTS.SERVER.MATCH_START, payload));
    this.socket.on(EVENTS.SERVER.MATCH_SNAPSHOT, (payload) => this.dispatch(EVENTS.SERVER.MATCH_SNAPSHOT, payload));
    this.socket.on(EVENTS.SERVER.POWER_GRANTED, (payload) => this.dispatch(EVENTS.SERVER.POWER_GRANTED, payload));
    this.socket.on(EVENTS.SERVER.POWER_RESULT, (payload) => this.dispatch(EVENTS.SERVER.POWER_RESULT, payload));
    this.socket.on(EVENTS.SERVER.MATCH_FINISH, (payload) => this.dispatch(EVENTS.SERVER.MATCH_FINISH, payload));
    this.socket.on(EVENTS.SERVER.LEADERBOARD_UPDATE, (payload) => this.dispatch(EVENTS.SERVER.LEADERBOARD_UPDATE, payload));
    this.socket.on(EVENTS.SERVER.ERROR_EVENT, (payload) => this.dispatch(EVENTS.SERVER.ERROR_EVENT, payload));
  }

  dispatch(name, detail = null) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  call(eventName, payload = {}) {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ ok: false, reason: "socket_missing" });
        return;
      }
      this.socket.emit(eventName, payload, (response) => resolve(response ?? { ok: false, reason: "no_response" }));
    });
  }

  join(payload) {
    return this.call(EVENTS.CLIENT.LOBBY_JOIN, payload);
  }

  resume(payload) {
    return this.call(EVENTS.CLIENT.SESSION_RESUME, payload);
  }

  setLevel(levelId) {
    return this.call(EVENTS.CLIENT.LOBBY_SET_LEVEL, { levelId });
  }

  startMatch(levelId) {
    return this.call(EVENTS.CLIENT.LOBBY_START_MATCH, { levelId });
  }

  readyRematch() {
    return this.call(EVENTS.CLIENT.LOBBY_READY_REMATCH, {});
  }

  sendAction(action) {
    this.socket?.emit(EVENTS.CLIENT.INPUT_ACTION, { action, pressedAtClientMs: Date.now() });
  }

  usePower(powerType) {
    return this.call(EVENTS.CLIENT.POWER_USE, { powerType, pressedAtClientMs: Date.now() });
  }
}
