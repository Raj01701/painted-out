// A tiny procedural harpsichord minuet (Web Audio, no files). It loops quietly under
// play and speeds up a touch while the Countess is looking.

const BPM = 112;
const BEAT = 60 / BPM;

// Two-voice minuet in G major, 3/4. Each entry: [MIDI note or 0 for rest, beats].
const MELODY: [number, number][] = [
  [74, 1], [67, 0.5], [69, 0.5], [71, 0.5], [72, 0.5],
  [74, 1], [67, 1], [67, 1],
  [76, 1], [72, 0.5], [74, 0.5], [76, 0.5], [78, 0.5],
  [79, 1], [67, 1], [67, 1],
  [72, 1], [74, 0.5], [72, 0.5], [71, 0.5], [69, 0.5],
  [71, 1], [72, 0.5], [71, 0.5], [69, 0.5], [67, 0.5],
  [66, 1], [67, 0.5], [69, 0.5], [71, 0.5], [67, 0.5],
  [69, 3],
];
const BASS: [number, number][] = [
  [55, 3], [59, 3], [60, 3], [59, 3], [57, 3], [55, 3], [50, 3], [50, 3],
];

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Minuet {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private bassStep = 0;
  private bassTime = 0;
  private tempo = 1;
  private muted = false;

  start(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.11;
    this.master.connect(this.ctx.destination);
    this.nextTime = this.bassTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
    // Silence the moment the tab is hidden or closed; pick up again when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
    window.addEventListener('pagehide', () => this.stop());
  }

  /** 1 = normal; slightly faster while the Countess watches. */
  setTempo(t: number): void {
    this.tempo = t;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.11, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.ctx?.close();
    this.ctx = null;
  }

  // Look-ahead scheduler: queue notes slightly ahead of the audio clock.
  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.2;
    const beat = BEAT / this.tempo;
    while (this.nextTime < horizon) {
      const [note, len] = MELODY[this.step];
      if (note) this.pluck(note, this.nextTime, len * beat, 0.9);
      this.nextTime += len * beat;
      this.step = (this.step + 1) % MELODY.length;
    }
    while (this.bassTime < horizon) {
      const [note, len] = BASS[this.bassStep];
      this.pluck(note, this.bassTime, len * beat, 0.7);
      this.bassTime += len * beat;
      this.bassStep = (this.bassStep + 1) % BASS.length;
    }
  }

  /** Harpsichord-ish pluck: bright sawtooth through a closing low-pass, fast decay. */
  private pluck(midi: number, at: number, dur: number, level: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq(midi);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq(midi) * 6, at);
    filter.frequency.exponentialRampToValueAtTime(freq(midi) * 1.5, at + 0.25);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(1.2, dur + 0.3));
    osc.connect(filter).connect(env).connect(this.master);
    osc.start(at);
    osc.stop(at + Math.min(1.3, dur + 0.4));
  }
}

export const music = new Minuet();
