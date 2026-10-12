"""Builds the in-game "How it was made" thumbnails: each scene's DreamLayer edit chain."""

from pathlib import Path

from PIL import Image

CHAINS = {
    "banquet": ["banquet-v1", "banquet-v1-removed", "banquet-v1-clean"],
    "hunt": ["hunt-v1", "hunt-v1-norider", "hunt-v1-clean"],
    "portrait": ["portrait-v1", "portrait-v1-removed", "portrait-v1-clean"],
    "ballroom": ["ballroom-v1", "ballroom-v1-nolady", "ballroom-v1-clean"],
    "picnic": ["picnic-v1", "picnic-v1-nolady", "picnic-v1-clean"],
    "finale": ["finale-v1", "finale-v1-nopainter", "finale-v1-clean"],
    "countess": ["countess-front-v1", "countess-back-v1"],
}

root = Path(__file__).resolve().parent.parent
out = root / "game/public/art/gallery"
for scene, steps in CHAINS.items():
    for i, name in enumerate(steps):
        img = Image.open(root / "art/raw" / f"{name}.png").convert("RGB")
        img.thumbnail((480, 480), Image.LANCZOS)
        img.save(out / f"{scene}-{i}.webp", quality=82)
print("gallery thumbnails:", len(list(out.glob("*.webp"))))
