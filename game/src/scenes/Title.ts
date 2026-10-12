import Phaser from 'phaser';
import { loadGameArt } from '../assets';
import { music } from '../music';
import { play } from '../sfx';

/** Title card: the banquet with Sir Bertram fading out of it, so the game explains itself before a word is read. */
export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  preload(): void {
    this.load.image('title-clean', 'art/banquet/clean.webp');
    this.load.image('title-bertram', 'art/banquet/bertram.png');
    this.load.image('title-countess', 'art/countess/look.png');
  }

  /** Download the rest of the game while the player reads the title, so Begin starts instantly. */
  private preloadGame(): void {
    loadGameArt(this);
    if (!this.load.list.size) return;
    const note = this.add.text(this.scale.width / 2, 600, 'Preparing the gallery…', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#c9b48a', fontStyle: 'italic',
    }).setOrigin(0.5).setStroke('#120c08', 4);
    this.load.on('progress', (v: number) => note.setText(`Preparing the gallery… ${Math.round(v * 100)}%`));
    this.load.once('complete', () => this.tweens.add({ targets: note, alpha: 0, duration: 400, onComplete: () => note.destroy() }));
    this.load.start();
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0x1b1410);

    const bg = this.add.image(width / 2, height / 2, 'title-clean');
    const s = Math.max(width / bg.width, height / bg.height);
    bg.setScale(s).setAlpha(0.55);
    const bertram = this.add.image(width / 2 + (555 - 640) * s, height / 2 + (150 - 360) * s, 'title-bertram')
      .setOrigin(0).setScale(s).setAlpha(0.55);
    this.tweens.add({ targets: bertram, alpha: 0, delay: 1200, duration: 1600, yoyo: true, hold: 1200, repeat: -1, repeatDelay: 600 });
    this.add.rectangle(0, 0, width, height, 0x1b1410, 0.35).setOrigin(0);

    this.add.text(width / 2, 210, 'Painted Out', {
      fontFamily: 'Georgia, serif', fontSize: '110px', color: '#f3e3c3', fontStyle: 'bold',
    }).setOrigin(0.5).setShadow(0, 6, '#000000', 12, true, true);
    this.add.text(width / 2, 300, 'Confessions of a Royal Retoucher', {
      fontFamily: 'Georgia, serif', fontSize: '30px', color: '#e0b45a', fontStyle: 'italic',
    }).setOrigin(0.5);

    const steps = [
      '1.  Scrub the disgraced noble out of every painting',
      '2.  Erase everything he left behind',
      "3.  Freeze when the Countess turns around",
    ];
    // Hierarchy: title, then the painting, then Begin. The rules arrive a beat later, quieter.
    steps.forEach((t, i) => {
      const rule = this.add.text(width / 2, 488 + i * 32, t, {
        fontFamily: 'Georgia, serif', fontSize: '21px', color: '#e8d8b8',
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: rule, alpha: 0.9, delay: 1400 + i * 250, duration: 500 });
    });

    const start = this.add.text(width / 2, 385, '  Begin  ', {
      fontFamily: 'Georgia, serif', fontSize: '36px', color: '#f3e3c3', backgroundColor: '#8e2a20', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: start, scale: 1.06, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut' });

    this.add.text(width / 2, 640, 'How it was made with DreamLayer ›', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#e0b45a', fontStyle: 'italic',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('Gallery'));

    const countess = this.add.image(width - 150, height, 'title-countess').setOrigin(0.5, 1);
    countess.setScale(330 / countess.height);

    const go = (hard = false) => {
      music.start(); // browsers only allow audio after a click
      this.registry.set('score', 0).set('stars', {}).set('hard', hard); // a fresh run
      play('erased');
      this.cameras.main.fadeOut(350, 27, 20, 16);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Play'));
    };
    start.on('pointerdown', () => go());
    this.input.keyboard!.once('keydown-ENTER', () => go());
    this.add.text(width / 2, 432, 'or play Hard ›', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#ff8a72', fontStyle: 'italic',
    }).setOrigin(0.5).setStroke('#120c08', 4).setInteractive({ useHandCursor: true }).on('pointerdown', () => go(true));
    this.input.keyboard!.once('keydown-G', () => this.scene.start('Gallery'));
    this.preloadGame();
  }
}
