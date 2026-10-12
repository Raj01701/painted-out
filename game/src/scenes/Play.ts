import Phaser from 'phaser';
import { DAYS, type Item, type Painting } from '../levels';
import { CANVAS_H, CANVAS_W, bakePlates, boundsOf, drawFigure, drawProp } from '../paint';
import { loadGameArt } from '../assets';
import { music } from '../music';
import { play } from '../sfx';

const PX = 40;
const PY = 120;
const BRUSH = 24;
const SAMPLE_STEP = 6;
const CLEARED_AT = 1; // spotless: an item counts only when every visible bit of it is gone
const HINT_AT = 0.85; // past this, the last specks glow so they can be found
const DAMAGED_AT = 0.12; // fraction of a protected figure that counts as ruined
const MAX_SCANDALS = 3;
const PANEL_X = PX + CANVAS_W + 40;
const COUNTESS_HEIGHT = 250;
const COUNTESS_FEET = 716;
const WALK_FIGURE = 500; // figure height inside a 512px DreamLayer walk frame
const WALK_FEET = 508 / 512; // ground anchor within the frame

interface Hotspot {
  item: Item;
  samples: { x: number; y: number; hit: boolean }[];
  hits: number;
  done: boolean;
}

/** The Countess patrols the gallery: away -> warn (turning) -> look -> away. */
type Gaze = 'away' | 'warn' | 'look';

export class Play extends Phaser.Scene {
  private dayIndex = 0;
  private paintingIndex = 0;
  private scandals = 0;

  private painting!: Painting;
  private reverse = false;
  private paused = false;
  private surface!: Phaser.GameObjects.RenderTexture;
  private original!: Phaser.GameObjects.Container;
  private brush!: Phaser.GameObjects.Image;
  private hotspots: Hotspot[] = [];
  private lastStamp: Phaser.Math.Vector2 | null = null;
  private timeLeft = 0;
  private finished = false;

  private countess!: Phaser.GameObjects.Sprite;
  private alarm!: Phaser.GameObjects.Text;
  private eye!: Phaser.GameObjects.Container;
  private gaze: Gaze = 'away';
  private gazeTimer = 0;
  private walkDir = 1;
  private lookVeil!: Phaser.GameObjects.Rectangle;
  private gazeLabel!: Phaser.GameObjects.Text;
  private caughtCooldown = 0;
  private scandalsAtStart = 0;
  private lastScrubAt = -9999; // ms, for the "Phew!" near-miss
  private lastClearAt = -9999; // ms, for trace combos
  private combo = 0;
  private floatSlots = 0;
  private lastTick = 99;
  private bubble: Phaser.GameObjects.Text | null = null;

  private tutorial: Phaser.GameObjects.Container | null = null;
  private leftovers!: Phaser.GameObjects.Graphics;
  private ticks = new Map<Hotspot, Phaser.GameObjects.Text>();
  private sunBar!: Phaser.GameObjects.Rectangle;
  private meter!: Phaser.GameObjects.Rectangle;
  private scandalText!: Phaser.GameObjects.Text;

  constructor() {
    super('Play');
  }

  init(data: { day?: number; painting?: number; scandals?: number }): void {
    const params = new URLSearchParams(location.search);
    this.dayIndex = data.day ?? Math.max(0, Number(params.get('day')) - 1);
    // ?day=D&painting=N jumps straight to a painting (1-based) for testing.
    const jump = Number(params.get('painting')) - 1;
    this.paintingIndex = data.painting ?? Math.max(0, jump);
    this.scandals = data.scandals ?? 0;
    this.finished = false;
    this.lastStamp = null;
    this.gaze = 'away';
    this.gazeTimer = 4;
    this.caughtCooldown = 0;
    this.tutorial = null;
    this.ticks = new Map();
    this.paused = false;
    this.scandalsAtStart = this.scandals;
    this.lastScrubAt = this.lastClearAt = -9999;
    this.combo = 0;
    this.floatSlots = 0;
    this.lastTick = 99;
    this.bubble = null;
  }

  preload(): void {
    loadGameArt(this); // normally already cached by the title screen
  }

  /** Images that make up the untouched painting: either the baked greybox plate or clean art plus its layers. */
  private paintingParts(beforeKey: string): Phaser.GameObjects.Image[] {
    const art = this.painting.art;
    if (!art) return [this.make.image({ key: beforeKey, x: 0, y: 0 } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false).setOrigin(0)];
    const s = CANVAS_W / this.textures.get(`${art}-clean`).getSourceImage().width;
    const parts = [this.make.image({ key: `${art}-clean`, x: 0, y: 0 } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false).setOrigin(0).setScale(s)];
    for (const item of this.painting.items)
      if (item.kind === 'layer')
        parts.push(this.make.image({ key: `${art}-${item.id}`, x: item.x, y: item.y } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false).setOrigin(0).setScale(s));
    return parts;
  }

  /** Whether a painting-local point is covered by the item's visible pixels (layers have shaped alpha). */
  private covers(item: Item, x: number, y: number): boolean {
    if (item.kind !== 'layer' || !this.painting.art) return true;
    const key = `${this.painting.art}-${item.id}`;
    const s = item.w / this.textures.get(key).getSourceImage().width;
    return (this.textures.getPixelAlpha((x - item.x) / s, (y - item.y) / s, key) ?? 0) > 128;
  }

  /** Hard mode (chosen on the title screen): less time, two scandals, a sharper Countess. */
  private get hard(): boolean {
    return !!this.registry.get('hard');
  }

  private get maxScandals(): number {
    return this.hard ? 2 : MAX_SCANDALS;
  }

  private get seconds(): number {
    return Math.round(this.painting.seconds * (this.hard ? 0.75 : 1));
  }

  create(): void {
    if (import.meta.env.DEV) (window as unknown as { __play: Play }).__play = this; // test hook, stripped from builds
    const day = DAYS[this.dayIndex];
    this.painting = day.paintings[this.paintingIndex];
    this.reverse = !!day.reverse;
    const key = `d${this.dayIndex}p${this.paintingIndex}`;
    const plates = this.painting.art ? null : bakePlates(this, this.painting, key);
    const afterKey = plates ? plates.after : `${this.painting.art}-clean`;

    this.cameras.main.setBackgroundColor(0x1b1410);
    // The painting hangs on a dim damask gallery wall (DreamLayer texture, darkened so the art stays the focus).
    this.add.image(640, 360, 'ui-wall').setDisplaySize(1280, 720).setTint(0x4a4a44);
    this.add.rectangle(PX - 6, PY - 4, CANVAS_W + 28, CANVAS_H + 28, 0x000000, 0.45).setOrigin(0); // frame shadow
    this.add.rectangle(PX - 14, PY - 14, CANVAS_W + 28, CANVAS_H + 28, 0x8a6a2a).setOrigin(0).setStrokeStyle(3, 0xd9b45a);
    // Erasing reveals what lies underneath. Normally that is the clean plate; on a
    // reverse day the layers are underneath and the clean plate is what you scrub away.
    const full = this.paintingParts(plates?.before ?? '');
    const clean = this.make.image({ key: afterKey, x: 0, y: 0 } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false)
      .setOrigin(0).setDisplaySize(CANVAS_W, CANVAS_H);
    if (this.reverse) this.add.container(PX, PY, full);
    else this.add.existing(clean.setPosition(PX, PY));
    this.surface = this.add.renderTexture(PX, PY, CANVAS_W, CANVAS_H).setOrigin(0);
    this.surface.draw(this.reverse ? clean : full).render();
    this.original = this.add.container(PX, PY, this.paintingParts(plates?.before ?? '')).setVisible(false);

    if (!this.textures.exists('brush')) {
      const bg = this.make.graphics({}, false);
      bg.fillStyle(0xffffff).fillCircle(BRUSH, BRUSH, BRUSH);
      bg.generateTexture('brush', BRUSH * 2, BRUSH * 2);
      bg.destroy();
    }
    this.brush = this.make.image({ key: 'brush' } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false);

    this.hotspots = this.painting.items
      // On a reverse day nobody can be smudged: scrubbing only ever paints things back.
      .filter((i) => i.role !== 'neutral' && !(this.reverse && i.role === 'protected'))
      .map((item) => {
        const r = boundsOf(item);
        const samples: Hotspot['samples'] = [];
        for (let y = r.y + SAMPLE_STEP / 2; y < r.y + r.h; y += SAMPLE_STEP)
          for (let x = r.x + SAMPLE_STEP / 2; x < r.x + r.w; x += SAMPLE_STEP)
            if (this.covers(item, x, y)) samples.push({ x, y, hit: false });
        return { item, samples, hits: 0, done: false };
      });

    this.leftovers = this.add.graphics().setDepth(4);
    this.tweens.add({ targets: this.leftovers, alpha: 0.55, yoyo: true, repeat: -1, duration: 380 });
    this.lookVeil = this.add.rectangle(640, 360, 1280, 720, 0x7a0f0a, 0).setDepth(5);
    this.buildCountess();
    this.buildHud(day);
    this.bindInput();
    this.outlineTexts();
    this.timeLeft = this.seconds;
    if (this.painting.hint) this.showTutorial(this.painting.hint);
    if (this.paintingIndex === 0) {
      this.showDayIntro(day);
      const target = this.hotspots.find((h) => h.item.role === 'target');
      if (target && this.dayIndex < 2) this.time.delayedCall(400, () => this.pulse(target, 0xf3e3c3, 4));
    }
  }

  /** A decree card that opens each day; the clock and the Countess wait for the click. */
  private showDayIntro(day: (typeof DAYS)[number]): void {
    this.paused = true;
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x0d0907, 0.82).setDepth(20).setInteractive();
    const title = this.add.text(640, 250, day.name, {
      fontFamily: 'Georgia, serif', fontSize: '48px', color: '#e0b45a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    const decree = this.add.text(640, 340, day.decree, {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f3e3c3', align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5).setDepth(21);
    const go = this.add.text(640, 460, '  Begin the day  ', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f3e3c3', backgroundColor: '#8e2a20', padding: { y: 10 },
    }).setOrigin(0.5).setDepth(21);
    veil.once('pointerdown', () => {
      play('trace');
      this.tweens.add({
        targets: [veil, title, decree, go], alpha: 0, duration: 300,
        onComplete: () => { [veil, title, decree, go].forEach((o) => o.destroy()); this.paused = false; },
      });
    });
  }

  // ---------- HUD ----------

  private buildHud(day: (typeof DAYS)[number]): void {
    this.add.text(PX, 24, this.painting.title, { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f3e3c3' });
    if (this.hard)
      this.add.text(PX + CANVAS_W - 70, 34, 'HARD', {
        fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ff6a5a', fontStyle: 'bold',
      }).setOrigin(1, 0);
    this.add.text(PX + CANVAS_W, 34, `${this.paintingIndex + 1} / ${day.paintings.length}`, {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#9a8a6a',
    }).setOrigin(1, 0);
    this.add.rectangle(PX, 76, CANVAS_W, 12, 0x3a2a1a).setOrigin(0);
    this.sunBar = this.add.rectangle(PX, 76, CANVAS_W, 12, 0xe0903a).setOrigin(0);

    // Decree card: a checklist of pictures, ticked off as each thing is erased.
    const cardY = PY;
    this.add.image(PANEL_X - 10, cardY - 10, 'ui-parchment').setOrigin(0).setDisplaySize(400, 330); // the decree itself
    this.add.text(PANEL_X + 190, cardY + 26, this.reverse ? 'PAINT BACK IN' : 'ERASE FROM HISTORY', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#b8322a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    const rows = this.hotspots
      .filter((h) => h.item.role !== 'protected')
      .sort((a, b) => Number(b.item.role === 'target') - Number(a.item.role === 'target'));
    const rowH = Math.min(56, 240 / rows.length);
    rows.forEach((h, i) => {
      const y = cardY + 66 + rowH * i + rowH / 2;
      this.icon(h.item, PANEL_X + 46, y, rowH - 8);
      this.add.text(PANEL_X + 86, y, h.item.label ?? h.item.id, {
        fontFamily: 'Georgia, serif', fontSize: '20px', color: '#2a1a10',
      }).setOrigin(0, 0.5);
      this.add.rectangle(PANEL_X + 340, y, 26, 26).setStrokeStyle(3, 0x2a1a10);
      this.ticks.set(h, this.add.text(PANEL_X + 340, y, '', { fontSize: '30px', color: '#2f8a3a', fontStyle: 'bold' }).setOrigin(0.5));
    });

    this.add.rectangle(PANEL_X, PY + 330, 380, 18, 0x3a2a1a).setOrigin(0);
    this.meter = this.add.rectangle(PANEL_X, PY + 330, 0, 18, 0x6fbf73).setOrigin(0);
    this.scandalText = this.add.text(PANEL_X, PY + 362, '', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f3e3c3' });
    this.refreshScandals();
    this.gazeLabel = this.add.text(PANEL_X + 190, PY + 410, '', {
      fontFamily: 'Georgia, serif', fontSize: '24px', color: '#ff6a5a', fontStyle: 'bold', align: 'center', wordWrap: { width: 380 },
    }).setOrigin(0.5, 0).setDepth(6);

    const btn = this.add.text(PANEL_X + 190, PY + 480, '  Done! Show the Countess  ', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f3e3c3', backgroundColor: '#8e2a20', padding: { y: 10 },
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.inspect());
    this.add.text(PANEL_X + 190, 690, 'SPACE: see the original  ·  M: music', { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#9a8a6a' }).setOrigin(0.5);
  }

  /** Draws an item from the painting as a small icon centred on (x, y). */
  private icon(item: Item, x: number, y: number, size: number): void {
    const r = boundsOf(item);
    const s = size / Math.max(r.w, r.h);
    if (item.kind === 'layer') {
      const k = size / Math.max(item.w, item.h); // the whole cut-out, not just its hit area
      this.add.image(x, y, `${this.painting.art}-${item.id}`).setDisplaySize(item.w * k, item.h * k);
      return;
    }
    const g = this.add.graphics();
    if (item.kind === 'figure') drawFigure(g, { ...item, faded: false }, false);
    else drawProp(g, item);
    g.setScale(s).setPosition(x - (r.x + r.w / 2) * s, y - (r.y + r.h / 2) * s);
  }

  private showTutorial(text: string): void {
    // Point at whatever the hint is about: the decoy for a "spare him" hint, otherwise the target.
    const decoy = /spare/i.test(text) ? this.hotspots.find((h) => h.item.role === 'protected') : undefined;
    const target = decoy ?? this.hotspots.find((h) => h.item.role === 'target');
    const r = target ? boundsOf(target.item) : { x: CANVAS_W / 2, y: CANVAS_H / 2, w: 0, h: 0 };
    // Keep the bubble on screen even when the figure reaches the top edge of the painting.
    const x = Phaser.Math.Clamp(PX + r.x + r.w / 2, PX + 180, PX + CANVAS_W - 180);
    const y = Math.max(PY + r.y - 20, PY + 90);
    const label = this.add.text(0, -54, text, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: '#1b1410', backgroundColor: '#f3e3c3', padding: { x: 12, y: 6 },
    }).setOrigin(0.5);
    const arrow = this.add.triangle(0, 0, -16, -24, 16, -24, 0, 0, 0xf3e3c3);
    this.tutorial = this.add.container(x, y, [label, arrow]).setDepth(7);
    this.tweens.add({ targets: this.tutorial, y: y - 10, yoyo: true, repeat: -1, duration: 450, ease: 'Sine.inOut' });
  }

  private dismissTutorial(): void {
    if (!this.tutorial) return;
    const t = this.tutorial;
    this.tutorial = null;
    this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
  }

  // ---------- The Countess ----------

  private buildCountess(): void {
    if (!this.anims.exists('countess-walk')) {
      // Per-frame timings come straight from DreamLayer's atlas (frame_durations_ms).
      const atlas = this.cache.json.get('countess-walk-data') as { frame_durations_ms?: number[] } | undefined;
      const durations = atlas?.frame_durations_ms ?? [];
      this.anims.create({
        key: 'countess-walk',
        frames: this.anims.generateFrameNames('countess-walk', { prefix: 'walk_', start: 1, end: 12, zeroPad: 2 })
          .map((f, i) => ({ ...f, duration: (durations[i] ?? 230) * 0.6 })),
        repeat: -1,
      });
    }
    this.countess = this.add.sprite(PX + 80, COUNTESS_FEET, 'countess-walk', 'walk_01').setOrigin(0.5, WALK_FEET).setDepth(8);
    this.countess.play('countess-walk');
    this.countess.setScale(this.countessScale()); // before the first update, so intro cards show her at size
    const eye = this.add.graphics();
    eye.fillStyle(0xf3e3c3).fillEllipse(0, 0, 96, 50).lineStyle(4, 0x2a1a10).strokeEllipse(0, 0, 96, 50);
    eye.fillStyle(0x7a0f0a).fillCircle(0, 0, 18).fillStyle(0x000000).fillCircle(0, 0, 9);
    this.eye = this.add.container(0, 0, [eye]).setDepth(9).setVisible(false);
    this.alarm = this.add.text(0, 0, '!', {
      fontFamily: 'Georgia, serif', fontSize: '64px', color: '#ff6a5a', fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(9).setVisible(false);
  }

  /** Front view and walk frames are framed differently; scale both to the same on-screen height. */
  private countessScale(): number {
    return this.countess.texture.key === 'countess-look' ? COUNTESS_HEIGHT / this.countess.height : COUNTESS_HEIGHT / WALK_FIGURE;
  }

  /** A quick squash-and-spring as she spins round, so the switch between views never pops. */
  private turnCountess(): void {
    const sx = this.countessScale();
    this.countess.setScale(sx * 0.15, sx * 1.04);
    this.tweens.add({ targets: this.countess, scaleX: sx, scaleY: sx, duration: 200, ease: 'Back.out' });
  }

  /** Front view when she is looking at you, back view (facing her walk) otherwise. */
  private drawCountess(): void {
    const looking = this.gaze === 'look';
    if (looking) {
      if (this.countess.texture.key !== 'countess-look') this.countess.stop().setTexture('countess-look').setOrigin(0.5, 1);
    } else {
      if (this.countess.texture.key !== 'countess-walk') this.countess.play('countess-walk').setOrigin(0.5, WALK_FEET);
      // She stops mid-step while turning, and walks the rest of the time.
      if (this.gaze === 'warn') this.countess.anims.pause();
      else if (this.countess.anims.isPaused) this.countess.anims.resume();
    }
    if (!this.tweens.isTweening(this.countess)) this.countess.setScale(this.countessScale());
    this.countess.setFlipX(!looking && this.walkDir < 0); // the walk cycle faces right
    this.alarm.setVisible(this.gaze === 'warn').setPosition(this.countess.x, this.countess.y - COUNTESS_HEIGHT - 4);
    if (looking && !this.eye.visible) {
      this.eye.setVisible(true).setScale(0.2);
      this.tweens.add({ targets: this.eye, scale: 1, duration: 220, ease: 'Back.out' });
    }
    if (!looking) this.eye.setVisible(false);
    this.eye.setPosition(this.countess.x, this.countess.y - COUNTESS_HEIGHT - 40);
  }

  private setGaze(next: Gaze): void {
    this.gaze = next;
    const harder = this.dayIndex; // she gets quicker and sneakier every day
    const firstLesson = this.dayIndex === 0 && this.paintingIndex === 0;
    if (next === 'away') {
      this.gazeTimer = Math.max(1.2, Phaser.Math.FloatBetween(2.2, 4.5) - 0.35 * harder) * (this.hard ? 0.7 : 1);
      this.gazeLabel.setText('').setFontSize(24);
      this.tweens.add({ targets: this.lookVeil, fillAlpha: 0, duration: 200 });
    } else if (next === 'warn') {
      // A fresh, unpredictable warning every time: anywhere from 0.40 s to 1.15 s.
      this.gazeTimer = Phaser.Math.FloatBetween(0.4, 1.15);
      this.gazeLabel.setText(firstLesson ? 'She is turning… stop scrubbing!' : 'She is turning…');
      play('warn');
      if (Math.random() < 0.35) this.bark(Phaser.Utils.Array.GetRandom(['Hmm?', 'What was that?', '*sniff*', 'Is someone there?']));
      this.tweens.add({ targets: this.countess, x: this.countess.x + 4, yoyo: true, repeat: 5, duration: 60 });
    } else {
      this.gazeTimer = Phaser.Math.FloatBetween(1.4, 2.2) * (this.hard ? 1.2 : 1);
      this.gazeLabel.setText(firstLesson ? 'FREEZE!\n(wait till she looks away)' : 'FREEZE!');
      this.gazeLabel.setFontSize(firstLesson ? 26 : 40).setScale(1.8);
      this.tweens.add({ targets: this.gazeLabel, scale: 1, duration: 260, ease: 'Back.out' });
      this.cameras.main.shake(120, 0.003);
      this.tweens.add({ targets: this.lookVeil, fillAlpha: 0.3, duration: 120 });
      if (!this.finished && this.time.now - this.lastScrubAt < 350 && this.caughtCooldown <= 0) {
        // Stopped just in time: the best feeling in a red-light-green-light game.
        play('phew');
        this.addScore(30);
        this.floatText('Phew! +30', 0xf3d27a);
        this.bark('…must be the candles.');
      } else if (!this.finished && Math.random() < 0.5) {
        this.bark(Phaser.Utils.Array.GetRandom(['Did that painting just… move?', 'I see everything, darling.', 'Hmm…', 'Something is different.']));
      }
    }
    music.setTempo(next === 'look' ? 1.15 : 1);
    const turning = (this.gaze === 'look') !== (this.countess.texture.key === 'countess-look');
    this.drawCountess();
    if (turning) this.turnCountess();
  }

  private updateCountess(dt: number): void {
    this.caughtCooldown = Math.max(0, this.caughtCooldown - dt);
    this.gazeTimer -= dt;
    if (this.gazeTimer <= 0) {
      // From Day 2 she sometimes bluffs: starts to turn, then goes back to gossiping.
      const bluff = this.gaze === 'warn' && Math.random() < [0, 0.25, 0.35, 0.35][Math.min(this.dayIndex, 3)] + (this.hard ? 0.15 : 0);
      this.setGaze(this.gaze === 'away' ? 'warn' : this.gaze === 'warn' && !bluff ? 'look' : 'away');
    }
    if (this.gaze === 'away') {
      this.countess.x += this.walkDir * 70 * dt;
      if (this.countess.x > PX + CANVAS_W - 60) this.walkDir = -1;
      if (this.countess.x < PX + 60) this.walkDir = 1;
    }
    this.drawCountess();
  }

  private caught(): void {
    if (this.caughtCooldown > 0) return;
    this.caughtCooldown = 2;
    this.scandals++;
    this.refreshScandals();
    play('caught');
    this.cameras.main.shake(260, 0.01);
    this.floatText('CAUGHT scrubbing! Scandal!', 0xff6a5a);
    this.bark('I KNEW it!');
    if (this.scandals >= this.maxScandals) this.inspect();
  }

  // ---------- Scrubbing ----------

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.scrubTo(p.x, p.y, true));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.scrubTo(p.x, p.y, false); });
    this.input.on('pointerup', () => { this.lastStamp = null; });
    this.input.once('pointerdown', () => music.start());
    this.input.keyboard!.on('keydown-M', () => music.toggleMute());
    const space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    space.on('down', () => this.original.setVisible(true));
    space.on('up', () => this.original.setVisible(false));
  }

  private scrubTo(sx: number, sy: number, fresh: boolean): void {
    if (this.finished || this.paused) return;
    const x = sx - PX;
    const y = sy - PY;
    if (x < -BRUSH || y < -BRUSH || x > CANVAS_W + BRUSH || y > CANVAS_H + BRUSH) return;
    if (this.gaze === 'look') {
      this.caught();
      return;
    }
    this.dismissTutorial();
    const from = fresh || !this.lastStamp ? new Phaser.Math.Vector2(x, y) : this.lastStamp;
    const dist = Phaser.Math.Distance.Between(from.x, from.y, x, y);
    const steps = Math.max(1, Math.ceil(dist / (BRUSH / 3)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.stamp(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    }
    this.surface.render();
    this.lastStamp = new Phaser.Math.Vector2(x, y);
    play('scrub');
    this.lastScrubAt = this.time.now;
    this.flecks(sx, sy);
    this.updateMeter();
    this.drawLeftovers();
  }

  private stamp(x: number, y: number): void {
    this.surface.erase(this.brush, x, y);
    const r2 = BRUSH * BRUSH;
    for (const h of this.hotspots) {
      if (h.done) continue;
      for (const s of h.samples) {
        if (s.hit) continue;
        const dx = s.x - x;
        const dy = s.y - y;
        if (dx * dx + dy * dy <= r2) { s.hit = true; h.hits++; }
      }
      const frac = h.hits / h.samples.length;
      if (h.item.role === 'protected' && frac >= DAMAGED_AT) {
        h.done = true;
        this.scandals++;
        this.refreshScandals();
        play('scandal');
        this.cameras.main.shake(220, 0.008);
        this.floatText('You smudged the wrong one! Scandal!', 0xff6a5a);
        this.smear(h);
      } else if (h.item.role !== 'protected' && frac >= CLEARED_AT) {
        h.done = true;
        this.onCleared(h);
      }
    }
  }

  /** A ruined patch of paint where a protected figure was scrubbed. */
  private smear(h: Hotspot): void {
    const r = boundsOf(h.item);
    const g = this.add.graphics().setDepth(1);
    for (let i = 0; i < 7; i++) {
      const cx = PX + r.x + r.w * Phaser.Math.FloatBetween(0.25, 0.75);
      const cy = PY + r.y + r.h * Phaser.Math.FloatBetween(0.15, 0.7);
      g.fillStyle(Phaser.Utils.Array.GetRandom([0x5a4636, 0x6b5440, 0x7a6450]), 0.55)
        .fillEllipse(cx, cy, r.w * Phaser.Math.FloatBetween(0.3, 0.6), r.h * Phaser.Math.FloatBetween(0.15, 0.3));
    }
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 300 });
  }

  /** Once a target or trace is mostly gone, its remaining specks glow so the player can find them. */
  private drawLeftovers(): void {
    this.leftovers.clear();
    for (const h of this.hotspots) {
      if (h.done || h.item.role === 'protected' || h.hits / h.samples.length < HINT_AT) continue;
      // Bare-canvas specks: a cream dot in a dark ring reads on both shadow and highlight
      // without clashing with the period palette.
      for (const p of h.samples) {
        if (p.hit) continue;
        this.leftovers.fillStyle(0x1b1410, 0.9).fillCircle(PX + p.x, PY + p.y, 7);
        this.leftovers.fillStyle(0xfff4dc, 1).fillCircle(PX + p.x, PY + p.y, 4);
      }
    }
  }

  /** Clearing is spotless: whatever faint pixels remain of the item vanish with it. */
  private wipeRest(h: Hotspot): void {
    const item = h.item;
    if (item.kind !== 'layer' || !this.painting.art) return;
    const key = `${this.painting.art}-${item.id}`;
    const s = item.w / this.textures.get(key).getSourceImage().width;
    const stamp = this.make.image({ key, x: item.x, y: item.y } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false)
      .setOrigin(0).setScale(s);
    this.surface.erase(stamp).render();
    stamp.destroy();
    // Layers can overlap (the horse cut-out contains part of the hound): pixels just wiped
    // are gone for every item, so credit them to the others too.
    for (const other of this.hotspots) {
      if (other === h || other.done || other.item.role === 'protected') continue;
      for (const p of other.samples)
        if (!p.hit && this.covers(item, p.x, p.y)) { p.hit = true; other.hits++; }
      if (other.hits / other.samples.length >= CLEARED_AT) { other.done = true; this.onCleared(other); }
    }
  }

  private onCleared(h: Hotspot): void {
    this.wipeRest(h);
    this.drawLeftovers();
    this.burst(h);
    const tick = this.ticks.get(h);
    if (tick) {
      tick.setText('✔').setScale(2);
      this.tweens.add({ targets: tick, scale: 1, duration: 250, ease: 'Back.out' });
    }
    if (h.item.role === 'target') {
      play('erased');
      play('gasp');
      this.cameras.main.shake(160, 0.004); // the whole painting flinches
      this.addScore(100);
      this.floatText(this.reverse ? 'Welcome back! Now his things…' : 'Gone! Now his things…', 0x9be29f);
      // The first time, point out every trace he left behind.
      if (this.paintingIndex === 0) for (const t of this.hotspots) if (t.item.role === 'trace' && !t.done) this.pulse(t, 0xf3e3c3, 3);
    } else {
      play('trace');
      this.addScore(50);
      // Clear traces in quick succession for a combo.
      this.combo = this.time.now - this.lastClearAt < 3000 ? this.combo + 1 : 1;
      if (this.combo > 1) {
        play('combo');
        this.addScore(50 * (this.combo - 1));
        this.floatText(`Combo ×${this.combo}!  +${50 * (this.combo - 1)}`, 0xf3d27a);
      } else this.floatText(this.reverse ? 'Restored!' : 'Trace gone!', 0x9be29f);
    }
    this.lastClearAt = this.time.now;
    const left = this.hotspots.filter((x) => x.item.role !== 'protected' && !x.done).length;
    if (left === 0) {
      play('win');
      this.time.delayedCall(500, () => this.inspect());
    }
  }

  private pulse(h: Hotspot, color: number, times: number): Phaser.GameObjects.Rectangle {
    const r = boundsOf(h.item);
    const ring = this.add.rectangle(PX + r.x + r.w / 2, PY + r.y + r.h / 2, r.w + 16, r.h + 16)
      .setStrokeStyle(4, color).setDepth(4);
    this.tweens.add({
      targets: ring, scale: 1.15, yoyo: true, repeat: times < 0 ? -1 : times * 2 - 1, duration: 300,
      onComplete: () => { if (times >= 0) ring.destroy(); },
    });
    return ring;
  }

  /** Gold sparkle where something has just vanished from history. */
  private burst(h: Hotspot): void {
    const r = boundsOf(h.item);
    const cx = PX + r.x + r.w / 2;
    const cy = PY + r.y + r.h / 2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const star = this.add.star(cx, cy, 4, 2, 7, 0xf3d27a).setDepth(6);
      this.tweens.add({
        targets: star, x: cx + Math.cos(a) * Phaser.Math.Between(50, 110), y: cy + Math.sin(a) * Phaser.Math.Between(50, 110),
        angle: 180, alpha: 0, scale: 0.4, duration: 650, ease: 'Cubic.out', onComplete: () => star.destroy(),
      });
    }
  }

  private flecks(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const dot = this.add.circle(x, y, Phaser.Math.Between(2, 5), Phaser.Utils.Array.GetRandom([0xd8c8a8, 0xb8322a, 0x6b4a2a]), 0.95);
      this.tweens.add({
        targets: dot,
        x: x + Phaser.Math.Between(-40, 40),
        y: y + Phaser.Math.Between(10, 60),
        alpha: 0,
        scale: 0.3,
        duration: 450,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private floatText(msg: string, color: number): void {
    // Messages that fire together stack downwards instead of overlapping.
    const slot = this.floatSlots++;
    const t = this.add.text(PX + CANVAS_W / 2, PY + 40 + (slot % 4) * 48, msg, {
      fontFamily: 'Georgia, serif', fontSize: '28px', color: `#${color.toString(16).padStart(6, '0')}`,
      backgroundColor: '#1b1410dd', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(9).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.out' });
    this.tweens.add({
      targets: t, y: t.y - 40, alpha: 0, delay: 900, duration: 600,
      onComplete: () => { t.destroy(); this.floatSlots = Math.max(0, this.floatSlots - 1); },
    });
  }

  private updateMeter(): void {
    const required = this.hotspots.filter((h) => h.item.role !== 'protected');
    const total = required.reduce((n, h) => n + h.samples.length, 0);
    const hit = required.reduce((n, h) => n + Math.min(h.hits, h.samples.length), 0);
    this.meter.width = total ? (380 * hit) / total : 0;
  }

  /** Text that sits straight on the damask wall gets a dark outline and shadow so it always reads. */
  private outlineTexts(): void {
    for (const o of this.children.list)
      if (o instanceof Phaser.GameObjects.Text && !o.style.backgroundColor && !this.onDecree(o)) this.legible(o);
  }

  /** The decree card is light parchment: its dark ink needs no outline. */
  private onDecree(t: Phaser.GameObjects.Text): boolean {
    return t.x >= PANEL_X - 10 && t.x <= PANEL_X + 400 && t.y >= PY - 10 && t.y <= PY + 320;
  }

  private legible(t: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
    return t.setStroke('#120c08', 5).setShadow(0, 2, '#000000', 4, true, true);
  }

  /** A speech bubble over the Countess: she is a character, and her lines telegraph her state. */
  private bark(text: string): void {
    this.bubble?.destroy();
    const b = this.add.text(this.countess.x, this.countess.y - COUNTESS_HEIGHT - 70, text, {
      fontFamily: 'Georgia, serif', fontSize: '20px', fontStyle: 'italic', color: '#2a1a10',
      backgroundColor: '#f3e3c3', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setDepth(12).setScale(0.6);
    this.bubble = b;
    this.tweens.add({ targets: b, scale: 1, duration: 150, ease: 'Back.out' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1400, duration: 400, onComplete: () => b.destroy() });
  }

  private addScore(points: number): void {
    this.registry.set('score', (this.registry.get('score') ?? 0) + points);
    this.refreshScandals();
  }

  /** 3 stars: no new scandal and 40% of the time left; 2: one of the two; 1: finished anyway. */
  private starsFor(missed: number): number {
    const clean = this.scandals === this.scandalsAtStart && missed === 0;
    const quick = this.timeLeft >= this.seconds * 0.4;
    return clean && quick ? 3 : clean || (quick && missed === 0) ? 2 : 1;
  }

  private refreshScandals(): void {
    this.scandalText.setText(`Scandals  ${'●'.repeat(this.scandals)}${'○'.repeat(Math.max(0, this.maxScandals - this.scandals))}      Score  ${this.registry.get('score') ?? 0}`);
  }

  update(_time: number, delta: number): void {
    if (this.finished || this.paused) return;
    const dt = delta / 1000;
    this.timeLeft -= dt;
    this.sunBar.width = Math.max(0, (CANVAS_W * this.timeLeft) / this.seconds);
    if (this.timeLeft < 5) {
      // Sunset: the bar flashes red and the clock ticks.
      this.sunBar.setFillStyle(Math.floor(this.time.now / 200) % 2 ? 0xff3a2a : 0xe0903a);
      const sec = Math.ceil(this.timeLeft);
      if (sec !== this.lastTick) { this.lastTick = sec; play('tick'); }
    }
    this.updateCountess(dt);
    if (this.timeLeft <= 0) this.inspect();
  }

  // ---------- Inspection ----------

  private inspect(): void {
    if (this.finished) return;
    this.finished = true;
    this.dismissTutorial(); // never leave the hint bubble over the verdict
    this.setGaze('look');
    this.gazeLabel.setText('Inspection!');
    const missed = this.hotspots.filter((h) => h.item.role !== 'protected' && !h.done);
    this.scandals += missed.length;
    this.refreshScandals();
    for (const h of missed) this.pulse(h, 0xff6a5a, -1);
    if (missed.length) play('scandal');

    const lost = this.scandals >= this.maxScandals;
    const stars = lost ? 0 : this.starsFor(missed.length);
    const starMap: Record<string, number> = this.registry.get('stars') ?? {};
    const key = `${this.dayIndex}-${this.paintingIndex}`;
    if (!lost) {
      starMap[key] = Math.max(starMap[key] ?? 0, stars);
      this.registry.set('stars', starMap);
      if (!missed.length) this.addScore(Math.ceil(this.timeLeft) * 5); // time bonus
    }
    const day = DAYS[this.dayIndex];
    const lastPainting = this.paintingIndex === day.paintings.length - 1;
    const lastDay = this.dayIndex === DAYS.length - 1;
    const theEnd = !lost && lastDay && lastPainting;
    const verdict = theEnd
      ? '…and so the Royal Retoucher\nnever existed.\n\n(The paintings, however, have never looked better.)'
      : lost
        ? `${this.maxScandals === 2 ? 'Two' : 'Three'} scandals.\nBy morning, YOU never existed.`
        : missed.length
          ? `"Hmm. What is THAT?"\nShe found ${missed.length} thing${missed.length > 1 ? 's' : ''} you missed.`
          : '"Spotless, darling."';
    if (theEnd) play('win');
    const starLine = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
    const dayStars = day.paintings.map((_, i) => starLine(starMap[`${this.dayIndex}-${i}`] ?? 0)).join('   ');
    const total = Object.values(starMap).reduce((a, b) => a + b, 0);
    const maxStars = DAYS.reduce((n, d) => n + d.paintings.length, 0) * 3;
    const grade = total >= maxStars * 0.9 ? 'Impeccable' : total >= maxStars * 0.7 ? 'Most Discreet' : total >= maxStars * 0.45 ? 'Adequate' : 'Smudgy';
    const tally = lost ? '' : theEnd
      ? `\n\n${total} / ${maxStars} ★   ·   Score ${this.registry.get('score') ?? 0}\nRetoucher's grade: ${grade}`
      : lastPainting ? `\n\n${starLine(stars)}\n${day.name.split(':')[0]}:  ${dayStars}` : `\n\n${starLine(stars)}`;
    const next = lost ? 'Try again' : !lastPainting ? 'Next painting' : theEnd ? 'Play again' : 'Next day';

    this.time.delayedCall(1100, () => {
      this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.72).setDepth(10);
      this.legible(this.add.text(640, 290, verdict + tally, {
        fontFamily: 'Georgia, serif', fontSize: '34px', color: '#f3e3c3', align: 'center', lineSpacing: 6,
      }).setOrigin(0.5).setDepth(11));
      const btn = this.add.text(640, 480, `  ${next}  `, {
        fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f3e3c3', backgroundColor: '#8e2a20', padding: { y: 10 },
      }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
      if (theEnd)
        this.add.text(640, 550, 'See how it was made ›', {
          fontFamily: 'Georgia, serif', fontSize: '24px', color: '#e0b45a', fontStyle: 'italic',
        }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.scene.start('Gallery'));
      btn.on('pointerdown', () => {
        if (lost) this.scene.restart({ day: this.dayIndex, painting: 0, scandals: 0 });
        else if (lastPainting) this.scene.restart({ day: lastDay ? 0 : this.dayIndex + 1, painting: 0, scandals: 0 });
        else this.scene.restart({ day: this.dayIndex, painting: this.paintingIndex + 1, scandals: this.scandals });
      });
    });
  }
}
