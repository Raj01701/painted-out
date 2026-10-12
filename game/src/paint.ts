import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, type Figure, type Item, type Painting, type Prop } from './levels';

export { CANVAS_H, CANVAS_W };

export interface Rect { x: number; y: number; w: number; h: number }

/** Bounding box of an item in painting-local space; used for hotspots. */
export function boundsOf(item: Item): Rect {
  if (item.kind === 'layer') return item.hit ?? { x: item.x, y: item.y, w: item.w, h: item.h };
  if (item.kind === 'figure') {
    const s = item.scale;
    return { x: item.x - 34 * s, y: item.y - 190 * s, w: 68 * s, h: 190 * s };
  }
  switch (item.shape) {
    case 'goblet': return { x: item.x - 10, y: item.y - 28, w: 20, h: 30 };
    case 'hat': return { x: item.x - 26, y: item.y - 24, w: 52, h: 28 };
    case 'dog': return { x: item.x - 40, y: item.y - 40, w: 80, h: 42 };
    case 'banner': return { x: item.x - 6, y: item.y - 10, w: 60, h: 120 };
    case 'monogram': return { x: item.x - 28, y: item.y - 28, w: 56, h: 56 };
  }
}

function drawBackdrop(g: Phaser.GameObjects.Graphics, p: Painting): void {
  const palettes = {
    hall: [0x5a3b2a, 0x7a5236, 0x3a2418],
    garden: [0x7fa7c4, 0x5d8a4e, 0x3c6a37],
    salon: [0x6b5a7a, 0x8b7a6a, 0x4a3a32],
  } as const;
  const [wall, mid, floor] = palettes[p.backdrop];
  g.fillStyle(wall).fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.fillStyle(mid).fillRect(0, CANVAS_H * 0.55, CANVAS_W, CANVAS_H * 0.2);
  g.fillStyle(floor).fillRect(0, CANVAS_H * 0.75, CANVAS_W, CANVAS_H * 0.25);
  if (p.backdrop === 'hall') {
    g.fillStyle(0x2a170e).fillRect(60, 340, 680, 30); // banquet table
    g.fillStyle(0xc9a227, 0.6).fillCircle(400, 70, 30); // chandelier
  } else if (p.backdrop === 'garden') {
    g.fillStyle(0x2f5a2c).fillCircle(120, 250, 80).fillCircle(700, 230, 90);
  } else {
    g.fillStyle(0xd8d0c0, 0.35).fillRect(600, 140, 120, 160); // mirror glass
    g.lineStyle(6, 0xc9a227).strokeRect(600, 140, 120, 160);
  }
}

export function drawFigure(g: Phaser.GameObjects.Graphics, f: Figure, ruined: boolean): void {
  const s = f.scale;
  const a = f.faded ? 0.45 : 1;
  if (ruined) {
    // What a careless brush leaves behind: a muddy smear where a person was.
    g.fillStyle(0x6b5d50, 0.9).fillEllipse(f.x, f.y - 90 * s, 80 * s, 170 * s);
    g.fillStyle(0x8a7a6a, 0.8).fillEllipse(f.x + 10 * s, f.y - 120 * s, 40 * s, 90 * s);
    return;
  }
  g.fillStyle(f.coat, a).fillRoundedRect(f.x - 30 * s, f.y - 140 * s, 60 * s, 140 * s, 12 * s);
  g.fillStyle(0xf0c9a0, a).fillCircle(f.x, f.y - 160 * s, 22 * s);
  g.fillStyle(f.hat, a).fillRect(f.x - 26 * s, f.y - 190 * s, 52 * s, 14 * s);
  if (f.moustache) {
    g.fillStyle(0x2a1a10, a).fillEllipse(f.x - 9 * s, f.y - 150 * s, 18 * s, 7 * s);
    g.fillEllipse(f.x + 9 * s, f.y - 150 * s, 18 * s, 7 * s);
  }
}

export function drawProp(g: Phaser.GameObjects.Graphics, p: Prop): void {
  g.fillStyle(p.color);
  switch (p.shape) {
    case 'goblet':
      g.fillTriangle(p.x - 10, p.y - 28, p.x + 10, p.y - 28, p.x, p.y - 10).fillRect(p.x - 2, p.y - 12, 4, 12);
      break;
    case 'hat':
      g.fillRect(p.x - 26, p.y - 6, 52, 8).fillRect(p.x - 16, p.y - 24, 32, 20);
      break;
    case 'dog':
      g.fillEllipse(p.x, p.y - 20, 60, 30).fillCircle(p.x + 30, p.y - 32, 12);
      g.fillRect(p.x - 22, p.y - 8, 6, 10).fillRect(p.x + 16, p.y - 8, 6, 10);
      break;
    case 'banner':
      g.fillStyle(0x3a2a1a).fillRect(p.x - 3, p.y - 10, 6, 120);
      g.fillStyle(p.color).fillTriangle(p.x + 3, p.y - 6, p.x + 56, p.y + 20, p.x + 3, p.y + 46);
      break;
    case 'monogram':
      g.lineStyle(5, p.color).strokeCircle(p.x, p.y, 24);
      g.fillStyle(p.color).fillRect(p.x - 10, p.y - 14, 6, 28).fillCircle(p.x + 2, p.y - 6, 8).fillCircle(p.x + 2, p.y + 7, 8);
      break;
  }
}

/**
 * Bakes the plates for one painting.
 * before: everything as originally painted.
 * after:  targets and traces gone; protected figures shown ruined, so that
 *         scrubbing them is visibly destructive.
 */
export function bakePlates(scene: Phaser.Scene, p: Painting, key: string): { before: string; after: string } {
  const g = scene.make.graphics({}, false);
  const bake = (name: string, include: (i: Item) => 'draw' | 'ruin' | 'skip') => {
    g.clear();
    drawBackdrop(g, p);
    for (const item of p.items) {
      const mode = include(item);
      if (mode === 'skip') continue;
      if (item.kind === 'figure') drawFigure(g, item, mode === 'ruin');
      else if (item.kind === 'prop' && mode === 'draw') drawProp(g, item);
    }
    g.generateTexture(name, CANVAS_W, CANVAS_H);
    return name;
  };
  const before = bake(`${key}-before`, () => 'draw');
  const after = bake(`${key}-after`, (i) =>
    i.role === 'target' || i.role === 'trace' ? 'skip' : i.role === 'protected' ? 'ruin' : 'draw');
  g.destroy();
  return { before, after };
}
