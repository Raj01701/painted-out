// Greybox level data. Every painting is described once; the "before" and
// "after" plates are both derived from it, the way DreamLayer edit pairs will be.

export type Role = 'target' | 'trace' | 'protected' | 'neutral';

export interface Figure {
  kind: 'figure';
  id: string;
  role: Role;
  label?: string; // checklist name for targets and traces
  x: number; // feet, painting-local
  y: number;
  scale: number;
  coat: number;
  hat: number;
  moustache?: boolean;
  faded?: boolean; // reflections and paintings-within-paintings
}

export interface Prop {
  kind: 'prop';
  id: string;
  role: Role;
  label?: string; // checklist name for targets and traces
  shape: 'goblet' | 'hat' | 'dog' | 'banner' | 'monogram';
  x: number;
  y: number;
  color: number;
}

/** A cut-out layer from a DreamLayer edit chain, in painting-local pixels. */
export interface Layer {
  kind: 'layer';
  id: string;
  role: Role;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hit?: { x: number; y: number; w: number; h: number }; // progress area, when smaller than the layer
}

export type Item = Figure | Prop | Layer;

export interface Painting {
  title: string;
  backdrop: 'hall' | 'garden' | 'salon';
  seconds: number;
  hint: string; // one short line; empty for none
  art?: string; // name of a DreamLayer layer set in public/art/
  items: Item[];
}

export interface Day {
  name: string;
  decree: string;
  reverse?: boolean; // scrubbing paints the target and traces back in
  paintings: Painting[];
}

import banquetArt from './art/banquet.json';
import huntArt from './art/hunt.json';
import portraitArt from './art/portrait.json';
import ballroomArt from './art/ballroom.json';
import picnicArt from './art/picnic.json';
import finaleArt from './art/finale.json';

export const CANVAS_W = 800;
export const CANVAS_H = 450;

interface ArtManifest {
  name: string;
  width: number;
  layers: { id: string; x: number; y: number; w: number; h: number; hit?: number[] }[];
}

/** Places a cut layer set on the painting canvas, assigning each layer its role. */
function artItems(art: ArtManifest, roles: Record<string, { role: Role; label: string }>): Item[] {
  const s = CANVAS_W / art.width;
  return art.layers.map((l) => ({
    kind: 'layer', id: l.id, ...roles[l.id], x: l.x * s, y: l.y * s, w: l.w * s, h: l.h * s,
    hit: l.hit && { x: l.hit[0] * s, y: l.hit[1] * s, w: l.hit[2] * s, h: l.hit[3] * s },
  }));
}


const DAY1_PAINTINGS: Painting[] = [
      {
        title: 'The Banquet',
        backdrop: 'hall',
        seconds: 45, // the first painting is also the lesson; cautious players need the time
        hint: 'Scrub him out!',
        art: 'banquet',
        items: artItems(banquetArt, {
          bertram: { role: 'target', label: 'Sir Bertram' },
          hat: { role: 'trace', label: 'his hat' },
          reflection: { role: 'trace', label: 'his reflection' },
        }),
      },
      {
        title: 'The Hunt',
        backdrop: 'garden',
        seconds: 30,
        hint: '',
        art: 'hunt',
        items: artItems(huntArt, {
          bertram: { role: 'target', label: 'Sir Bertram' },
          horse: { role: 'trace', label: 'his horse' },
          hound: { role: 'trace', label: 'his hound' },
        }),
      },
      {
        title: 'The Family Portrait',
        backdrop: 'salon',
        seconds: 30,
        hint: 'His twin has no moustache. Spare the twin!',
        art: 'portrait',
        items: artItems(portraitArt, {
          twin: { role: 'protected', label: 'his twin Barnaby' },
          bertram: { role: 'target', label: 'Sir Bertram' },
          cushion: { role: 'trace', label: 'his monogram' },
        }),
      },
];

export const DAYS: Day[] = [
  {
    name: 'Day 1: The Moustache Incident',
    decree: 'Sir Bertram laughed at the Duke.',
    paintings: DAY1_PAINTINGS,
  },
  {
    name: 'Day 2: All Is Forgiven',
    decree: 'The Duke misses Sir Bertram. Paint him back in. Every last thing.',
    reverse: true,
    paintings: DAY1_PAINTINGS.map((p) => ({ ...p, hint: p === DAY1_PAINTINGS[0] ? 'Scrub to paint him back!' : '' })),
  },
  {
    name: 'Day 3: The Yawn',
    decree: "Lady Constance yawned during the Duke's poem. She NEVER EXISTED.",
    paintings: [
      {
        title: 'The Minuet',
        backdrop: 'hall',
        seconds: 30,
        hint: '',
        art: 'ballroom',
        items: artItems(ballroomArt, {
          constance: { role: 'target', label: 'Lady Constance' },
          shawl: { role: 'trace', label: 'her shawl' },
          poodle: { role: 'trace', label: 'her poodle' },
        }),
      },
      {
        title: 'The Recital',
        backdrop: 'garden',
        seconds: 30,
        hint: '',
        art: 'picnic',
        items: artItems(picnicArt, {
          constance: { role: 'target', label: 'Lady Constance' },
          basket: { role: 'trace', label: 'her picnic basket' },
        }),
      },
    ],
  },
  {
    name: 'Day 4: The Last Retouch',
    decree: 'The Duke has decided the Royal Retoucher knows far too much.',
    paintings: [
      {
        title: 'Self-Portrait',
        backdrop: 'hall',
        seconds: 30,
        hint: 'Erase… yourself.',
        art: 'finale',
        items: artItems(finaleArt, {
          retoucher: { role: 'target', label: 'yourself' },
          easel: { role: 'trace', label: 'your easel' },
          palette: { role: 'trace', label: 'your palette' },
          duke: { role: 'protected', label: 'the Duke' },
        }),
      },
    ],
  },
];
