import { zzfx } from 'zzfx';

// Sound recipes are ZzFX parameter lists, designed at https://killedbyapixel.github.io/ZzFX/
const SOUNDS = {
  scrub: [0.25, 0.6, 180, , 0.02, 0.04, 4, 0.4, , , , , , 0.6, , , , 0.5],
  erased: [0.6, , 520, 0.02, 0.12, 0.25, 1, 1.6, , , 240, 0.06, 0.06],
  trace: [0.45, , 760, 0.01, 0.05, 0.12, 1, 2, , , 380, 0.04],
  warn: [0.5, , 330, 0.04, 0.2, 0.25, 2, 0.6, , , , , 0.1],
  caught: [0.8, , 90, 0.02, 0.25, 0.45, 3, 2.4, -4, , , , , 0.5, , 0.3],
  scandal: [0.7, , 140, 0.03, 0.3, 0.5, 4, 1.5, -2, , -80, 0.1],
  win: [0.6, , 440, 0.04, 0.3, 0.4, 1, 1.5, , , 220, 0.08, 0.12],
  tick: [0.35, , 1400, , 0.01, 0.03, 1, 0.5],
  phew: [0.5, , 600, 0.02, 0.1, 0.3, 0, 1, -0.5],
  combo: [0.5, , 900, 0.01, 0.08, 0.15, 1, 2, , , 450, 0.05],
  gasp: [0.6, 0.3, 300, 0.02, 0.06, 0.2, 4, 0.8, 3],
} as const;

let lastScrub = 0;

export function play(name: keyof typeof SOUNDS): void {
  if (name === 'scrub') {
    const now = performance.now();
    if (now - lastScrub < 70) return; // a scrub stroke fires many stamps per frame
    lastScrub = now;
  }
  zzfx(...(SOUNDS[name] as readonly (number | undefined)[]));
}
