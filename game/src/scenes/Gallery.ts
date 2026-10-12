import Phaser from 'phaser';
import { play } from '../sfx';

interface Chain {
  scene: string;
  title: string;
  steps: { caption: string; prompt: string }[];
  note: string;
}

// Every painting in the game is a DreamLayer edit chain: one reference, one change at a time.
const CHAINS: Chain[] = [
  {
    scene: 'banquet', title: 'The Banquet',
    steps: [
      { caption: '1 · generated', prompt: '"Storybook oil painting of an 18th-century palace banquet…"' },
      { caption: '2 · edit', prompt: '"Keep this exact painting… remove the man in the red coat"' },
      { caption: '3 · edit', prompt: '"…remove the hat and the reflected man in the mirror"' },
    ],
    note: 'Step 2 kept his reflection in the mirror. A happy accident that became a trace to find.',
  },
  {
    scene: 'hunt', title: 'The Hunt',
    steps: [
      { caption: '1 · edit of the Banquet', prompt: '"Same duke, same man in red… a hunting party"' },
      { caption: '2 · edit', prompt: '"…remove the rider and his banner"' },
      { caption: '3 · edit', prompt: '"…remove the horse and the hound"' },
    ],
    note: 'Made from the Banquet as the single reference, so the Duke and Bertram keep their faces.',
  },
  {
    scene: 'portrait', title: 'The Family Portrait',
    steps: [
      { caption: '1 · edit of the Banquet', prompt: '"…his identical twin, completely clean-shaven"' },
      { caption: '2 · edit', prompt: '"…remove the man on the right"' },
      { caption: '3 · edit', prompt: '"…remove the cushion with the letter B"' },
    ],
    note: 'Step 2 also took the twin\'s wig. Scrub the twin by mistake and you reveal him bald.',
  },
  {
    scene: 'ballroom', title: 'The Minuet',
    steps: [
      { caption: '1 · edit of the Banquet', prompt: '"…the duke and the lady dance; she is yawning"' },
      { caption: '2 · edit', prompt: '"…remove the lady, the duke left dancing alone"' },
      { caption: '3 · edit', prompt: '"…remove the poodle and the shawl"' },
    ],
    note: 'Her layer includes the Duke\'s original pose, so erasing her leaves him waltzing with nobody.',
  },
  {
    scene: 'picnic', title: 'The Recital',
    steps: [
      { caption: '1 · edit of the Minuet', prompt: '"…a garden picnic; she sleeps through his poem"' },
      { caption: '2 · edit', prompt: '"…remove the sleeping lady"' },
      { caption: '3 · edit (unused)', prompt: '"…remove the parasol and poodle"' },
    ],
    note: 'Step 3 came back zoomed in, so the game uses step 2 as its base. Checking alignment matters.',
  },
  {
    scene: 'finale', title: 'Self-Portrait',
    steps: [
      { caption: '1 · edit of the Banquet', prompt: '"…a court painter at an easel; the duke points"' },
      { caption: '2 · edit', prompt: '"…remove the painter"' },
      { caption: '3 · edit', prompt: '"…remove the easel and the palette"' },
    ],
    note: 'Step 2 removed the Duke too, so he is cut from step 1 and laid back on top.',
  },
  {
    scene: 'countess', title: 'The Countess',
    steps: [
      { caption: '1 · generated', prompt: '"A gossiping Countess… looking straight at the viewer"' },
      { caption: '2 · edit', prompt: '"Keep this exact character… seen from behind"' },
    ],
    note: 'One reference, two poses: she turns to look at you.',
  },
];

/**
 * "How it was made": the DreamLayer edit chain behind each painting.
 * DreamLayer edits repaint the whole image (about 21% of pixels drift outside the edit),
 * so the game cuts every removable thing into its own layer locally and stacks the
 * layers on the clean plate. That is why scrubbing looks seamless.
 */
export class Gallery extends Phaser.Scene {
  private index = 0;
  private page!: Phaser.GameObjects.Container;

  constructor() {
    super('Gallery');
  }

  preload(): void {
    this.load.image('ui-wall', 'art/ui/wall.webp');
    for (const c of CHAINS) c.steps.forEach((_, i) => this.load.image(`g-${c.scene}-${i}`, `art/gallery/${c.scene}-${i}.webp`));
  }

  create(): void {
    this.index = 0;
    this.cameras.main.setBackgroundColor(0x1b1410);
    this.add.image(640, 360, 'ui-wall').setDisplaySize(1280, 720).setTint(0x3a3a36);
    this.add.text(640, 40, 'How it was made', {
      fontFamily: 'Georgia, serif', fontSize: '40px', color: '#e0b45a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add.text(640, 92, 'Every painting is a DreamLayer edit chain: one reference image, one change at a time.', {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#c9b48a',
    }).setOrigin(0.5, 0);
    this.page = this.add.container(0, 0);
    this.render();

    const nav = (label: string, x: number, step: number) =>
      this.add.text(x, 650, label, {
        fontFamily: 'Georgia, serif', fontSize: '26px', color: '#f3e3c3', backgroundColor: '#8e2a20', padding: { x: 14, y: 8 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.turn(step));
    nav('‹ Prev', 470, -1);
    nav('Next ›', 810, 1);
    this.add.text(1240, 650, 'Back', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f3e3c3',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('Title'));
    this.input.keyboard!.on('keydown-LEFT', () => this.turn(-1));
    this.input.keyboard!.on('keydown-RIGHT', () => this.turn(1));
    this.input.keyboard!.once('keydown-G', () => this.scene.start('Title'));
    this.input.keyboard!.once('keydown-ESC', () => this.scene.start('Title'));
  }

  private turn(step: number): void {
    this.index = (this.index + step + CHAINS.length) % CHAINS.length;
    play('trace');
    this.render();
  }

  private render(): void {
    this.page.removeAll(true);
    const c = CHAINS[this.index];
    const cols = c.steps.length;
    const cellW = 380;
    const gap = 40;
    const left = 640 - (cols * cellW + (cols - 1) * gap) / 2;
    const parts: Phaser.GameObjects.GameObject[] = [
      this.add.text(640, 140, `${c.title}   ${this.index + 1} / ${CHAINS.length}`, {
        fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f3e3c3',
      }).setOrigin(0.5, 0),
    ];
    c.steps.forEach((s, i) => {
      const x = left + i * (cellW + gap) + cellW / 2;
      const img = this.add.image(x, 340, `g-${c.scene}-${i}`);
      img.setScale(Math.min(cellW / img.width, 300 / img.height));
      parts.push(
        this.add.rectangle(x, 340, img.displayWidth + 12, img.displayHeight + 12, 0x8a6a2a),
        img,
        this.add.text(x, 500, s.caption, { fontFamily: 'Georgia, serif', fontSize: '23px', color: '#e0b45a' }).setOrigin(0.5, 0),
        this.add.text(x, 532, s.prompt, {
          fontFamily: 'Georgia, serif', fontSize: '19px', color: '#c9b48a', fontStyle: 'italic', align: 'center', wordWrap: { width: cellW },
        }).setOrigin(0.5, 0),
      );
      if (i < cols - 1) parts.push(this.add.text(x + cellW / 2 + gap / 2, 340, '→', { fontSize: '32px', color: '#e0b45a' }).setOrigin(0.5));
    });
    parts.push(this.add.text(640, 588, c.note, {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f3e3c3', align: 'center', wordWrap: { width: 1100 },
    }).setOrigin(0.5, 0));
    this.page.add(parts);
  }
}
