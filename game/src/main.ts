import Phaser from 'phaser';
import { Play } from './scenes/Play';
import { Title } from './scenes/Title';
import { Gallery } from './scenes/Gallery';

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#1b1410',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
  render: { antialias: true },
  // ?day= or ?painting= skips the title for testing.
  scene: new URLSearchParams(location.search).has('painting') || new URLSearchParams(location.search).has('day') ? [Play, Title, Gallery] : [Title, Play, Gallery],
});
