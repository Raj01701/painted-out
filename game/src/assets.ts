import Phaser from 'phaser';
import { DAYS } from './levels';

/**
 * Queues every texture the game needs. The title screen calls this so the art downloads
 * while the player reads it; the play scene calls it again and finds everything cached.
 */
export function loadGameArt(scene: Phaser.Scene): void {
  const image = (key: string, url: string) => {
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  };
  image('ui-wall', 'art/ui/wall.webp');
  image('ui-parchment', 'art/ui/parchment.webp');
  image('countess-look', 'art/countess/look.png');
  // DreamLayer sprite_sheet output (walk preset, 12 frames) loads as-is: its atlas.json is TexturePacker JSON-hash.
  if (!scene.textures.exists('countess-walk')) scene.load.atlas('countess-walk', 'art/countess/walk.webp', 'art/countess/walk.json');
  if (!scene.cache.json.exists('countess-walk-data')) scene.load.json('countess-walk-data', 'art/countess/walk.json');
  for (const day of DAYS)
    for (const p of day.paintings) {
      if (!p.art) continue;
      image(`${p.art}-clean`, `art/${p.art}/clean.webp`);
      for (const item of p.items) if (item.kind === 'layer') image(`${p.art}-${item.id}`, `art/${p.art}/${item.id}.png`);
    }
}
