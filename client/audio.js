export class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  tone(freq, duration = 0.12, type = "triangle", gain = 0.05, when = 0) {
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    const startAt = this.ctx.currentTime + when;
    osc.start(startAt);
    amp.gain.setValueAtTime(gain, startAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.stop(startAt + duration);
  }

  playJump() {
    this.tone(520, 0.1, "triangle", 0.06);
  }

  playSlide() {
    this.tone(260, 0.12, "sawtooth", 0.045);
  }

  playPower(powerType) {
    if (powerType === "rocket") {
      this.tone(760, 0.18, "square", 0.06);
      this.tone(940, 0.2, "triangle", 0.03, 0.05);
      return;
    }
    if (powerType === "hand") {
      this.tone(410, 0.09, "square", 0.055);
      return;
    }
    if (powerType === "oil") {
      this.tone(180, 0.14, "sine", 0.06);
      return;
    }
    this.tone(440, 0.1, "triangle", 0.05);
  }

  playHit() {
    this.tone(120, 0.16, "sawtooth", 0.08);
  }

  playFinish() {
    this.tone(660, 0.2, "triangle", 0.07);
    this.tone(880, 0.24, "triangle", 0.06, 0.08);
    this.tone(1100, 0.26, "triangle", 0.04, 0.14);
  }

  startMusic(levelId) {
    this.stopMusic();
    this.ensureContext();
    const palette =
      levelId === "ice"
        ? [220, 330, 440, 550]
        : levelId === "desert"
          ? [196, 294, 392, 523]
          : [247, 370, 494, 659];
    this.musicStep = 0;
    this.musicTimer = setInterval(() => {
      const note = palette[this.musicStep % palette.length];
      this.tone(note, 0.24, "triangle", 0.03);
      this.musicStep += 1;
    }, 340);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
