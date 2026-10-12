"""Cut a single character off its plain background and trim it, for in-game sprites.

Usage: uv run python cut_sprite.py <source.png> <out.png> [height]
"""

import sys

from PIL import Image
from rembg import new_session, remove


def main(src: str, out: str, height: int = 520) -> None:
    img = Image.open(src).convert("RGB")
    cut = remove(img, session=new_session("birefnet-general"))
    cut = cut.crop(cut.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox())
    cut = cut.resize((round(cut.width * height / cut.height), height), Image.LANCZOS)
    cut.save(out, optimize=True)
    print(f"{out}: {cut.width}x{cut.height}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], *(int(a) for a in sys.argv[3:]))
