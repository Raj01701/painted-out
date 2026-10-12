"""Cut removable layers out of a DreamLayer edit chain and lay them over the clean plate.

DreamLayer edits re-render the whole image (about 21% of pixels drift outside the
edited area), so whole-image swaps would shimmer. Instead every removable thing
becomes its own transparent layer, cut from the image where it still exists:

  person layers: segmented with rembg (BiRefNet) inside the item's box
  object layers: everything inside the box that differs from the clean plate
                 (or from an optional intermediate edit given as "base")

Usage: uv run python cut_layers.py ../art/scenes/banquet.json
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from rembg import new_session, remove

OUT_WIDTH = 1280  # shipped resolution; sources are 2560 wide


def diff_mask(src: np.ndarray, clean: np.ndarray, threshold: float) -> np.ndarray:
    d = np.abs(src.astype(np.float32) - clean.astype(np.float32)).mean(axis=2)
    return (d > threshold).astype(np.uint8) * 255


def largest_blob(mask: np.ndarray) -> np.ndarray:
    """Keep only the biggest connected region; drift speckle is many tiny islands."""
    labels, n = ndimage.label(mask > 0)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask > 0, labels, range(1, n + 1))
    keep = ndimage.binary_fill_holes(labels == (int(np.argmax(sizes)) + 1))
    return keep.astype(np.uint8) * 255


def soften(mask: Image.Image, grow: int, feather: float) -> Image.Image:
    if grow:
        mask = mask.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return mask.filter(ImageFilter.GaussianBlur(feather))


def main(spec_path: str) -> None:
    spec_file = Path(spec_path).resolve()
    spec = json.loads(spec_file.read_text())
    root = spec_file.parent
    clean = Image.open(root / spec["clean"]).convert("RGB")
    out_dir = root.parent / "layers" / spec["name"]
    out_dir.mkdir(parents=True, exist_ok=True)
    scale = OUT_WIDTH / clean.width

    clean.resize((OUT_WIDTH, round(clean.height * scale)), Image.LANCZOS).save(out_dir / "clean.webp", quality=90)
    session = None
    manifest = {"name": spec["name"], "width": OUT_WIDTH, "height": round(clean.height * scale), "layers": []}

    for layer in spec["layers"]:
        x0, y0, x1, y1 = layer["box"]
        src = Image.open(root / layer["source"]).convert("RGB").crop((x0, y0, x1, y1))
        if layer["method"] == "person":
            session = session or new_session("birefnet-general")
            mask = remove(src, session=session, only_mask=True)
            mask = soften(mask, 2, 1.5)
        elif layer["method"] == "subject-diff":
            # A rider on a horse: the subject mask alone takes the horse too, the diff
            # alone takes repainted sky. Their intersection is just what was removed.
            session = session or new_session("birefnet-general")
            subject = np.asarray(remove(src, session=session, only_mask=True)) > 128
            base = Image.open(root / layer["base"]).convert("RGB").crop((x0, y0, x1, y1))
            changed = diff_mask(np.asarray(src), np.asarray(base), layer.get("threshold", 28)) > 0
            m = ndimage.binary_closing(subject & ndimage.binary_dilation(changed, iterations=3), iterations=3)
            # Pull the edge in a little: the diff halo around a rider reads as a white outline.
            m = ndimage.binary_erosion(largest_blob(m.astype(np.uint8) * 255) > 0, iterations=2)
            mask = soften(Image.fromarray(m.astype(np.uint8) * 255), 0, 1.5)
        else:
            base_img = Image.open(root / layer["base"]).convert("RGB") if "base" in layer else clean
            base = base_img.crop((x0, y0, x1, y1))
            m = diff_mask(np.asarray(src), np.asarray(base), layer.get("threshold", 28))
            m = ndimage.binary_closing(m > 0, iterations=4).astype(np.uint8) * 255
            m = largest_blob(m)
            mask = soften(Image.fromarray(m), layer.get("grow", 6), 3)

        for ex in layer.get("exclude", []):  # regions that belong to someone else, e.g. a neighbour's fan
            ex0, ey0, ex1, ey1 = ex
            hole = Image.new("L", mask.size, 255)
            hole.paste(0, (ex0 - x0, ey0 - y0, ex1 - x0, ey1 - y0))
            mask = Image.fromarray(np.minimum(np.asarray(mask), np.asarray(hole.filter(ImageFilter.GaussianBlur(4)))))

        rgba = src.copy()
        rgba.putalpha(mask)
        w, h = round((x1 - x0) * scale), round((y1 - y0) * scale)
        rgba.resize((w, h), Image.LANCZOS).save(out_dir / f"{layer['id']}.png", optimize=True)
        entry = {"id": layer["id"], "x": round(x0 * scale), "y": round(y0 * scale), "w": w, "h": h}
        if "hit" in layer:  # the part that counts for progress, when a layer carries more than its subject
            hx0, hy0, hx1, hy1 = layer["hit"]
            entry["hit"] = [round(hx0 * scale), round(hy0 * scale), round((hx1 - hx0) * scale), round((hy1 - hy0) * scale)]
        manifest["layers"].append(entry)
        print(f"{layer['id']}: {w}x{h} at ({round(x0 * scale)}, {round(y0 * scale)})")

    (out_dir / "layers.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
