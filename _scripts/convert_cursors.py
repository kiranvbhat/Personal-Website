"""Converts Windows cursor files into PNGs that browsers can use, and lists them in _data/cursors.yml.

Browsers can't use .ani (animated) cursors and support .cur unevenly, so each cursor is saved as PNGs:
  assets/cursors/web/<id>/<state>.png           32px cursor (the first frame, if animated)
  assets/cursors/web/<id>/<state>-<n>.png       32px animation frames (animated cursors only)
  assets/cursors/web/<id>/<state>-preview.png   64px animated PNG for the cursor menu (animated cursors only)
plus a 64px "@2x" copy of each 32px image for sharp cursors on high-resolution screens.
<state> is "cursor" (normal) or "pointer" (hovering a link).

Each cursor in _data/cursors.yml lists its source files as `file:` under `cursor:` and `pointer:` (pointer is optional;
without it the normal cursor is used for links too). To add a cursor, add an entry with `id`, `name` and those files,
then run this. Everything else in the entry is filled in. Names and order are kept.

Usage (needs Pillow and PyYAML):
  python3 _scripts/convert_cursors.py
      converts every cursor listed in _data/cursors.yml
  python3 _scripts/convert_cursors.py "assets/cursors/sweezy cursors"
      also adds new cursors from a folder whose files are named "<Name>--cursor--<anything>.cur/.ani" and
      "<Name>--pointer--<anything>.cur/.ani" (like the Sweezy Cursors downloads), at the end of the list
"""
import io
import re
import shutil
import struct
import sys
from pathlib import Path

import yaml
from PIL import Image

Resampling = getattr(Image, "Resampling", Image)  # Pillow 9.1+ moved the resampling filters here

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets/cursors/web"
DATA_FILE = ROOT / "_data/cursors.yml"
CURSOR_SIZE = 32
PREVIEW_SIZE = 64


def read_cur(data):
    """Returns {size: (image, hotspot_x, hotspot_y)} for every image in a .cur file."""
    _, _, count = struct.unpack("<HHH", data[:6])
    images = {}
    for i in range(count):
        width, height, _, _, hot_x, hot_y, length, offset = struct.unpack("<BBBBHHII", data[6 + 16 * i:22 + 16 * i])
        width = width or 256
        image_data = data[offset:offset + length]
        if image_data[:4] == b"\x89PNG":
            image = Image.open(io.BytesIO(image_data)).convert("RGBA")
        else:
            # A BMP image: wrap it in a one-image .ico file, which Pillow can decode (including its transparency mask).
            entry = data[6 + 16 * i:10 + 16 * i] + struct.pack("<HHII", 1, 0, length, 22)
            ico = struct.pack("<HHH", 0, 1, 1) + entry + image_data
            image = Image.open(io.BytesIO(ico)).convert("RGBA")
        images[width] = (image, hot_x, hot_y)
    return images


def read_ani(data):
    """Returns (frames, frame delays in ms) for a .ani file. Each frame is like read_cur's result."""
    frames, rates, sequence, default_rate = [], None, None, 10

    def walk(start, end):
        nonlocal rates, sequence, default_rate
        pos = start
        while pos < end:
            chunk_id = data[pos:pos + 4]
            size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
            body = data[pos + 8:pos + 8 + size]
            if chunk_id == b"LIST":
                walk(pos + 12, pos + 8 + size)
            elif chunk_id == b"anih":
                default_rate = struct.unpack("<9I", body[:36])[7]
            elif chunk_id == b"rate":
                rates = list(struct.unpack("<%dI" % (size // 4), body))
            elif chunk_id == b"seq ":
                sequence = list(struct.unpack("<%dI" % (size // 4), body))
            elif chunk_id == b"icon":
                frames.append(read_cur(body))
            pos += 8 + size + (size & 1)

    walk(12, len(data))
    order = sequence or list(range(len(frames)))
    # Rates are in "jiffies" (1/60 of a second).
    delays = [round((rates[i] if rates else default_rate) * 1000 / 60) for i in range(len(order))]
    return [frames[i] for i in order], delays


def pick(images, size):
    """The image closest to `size`, resized to exactly `size`, with its hotspot scaled to match."""
    best = min(images, key=lambda s: (abs(s - size), -s))
    image, hot_x, hot_y = images[best]
    scale = size / best
    if best != size:
        # Whole-number enlargements keep pixel art crisp; anything else is smoothed.
        resample = Resampling.NEAREST if size % best == 0 else Resampling.LANCZOS
        image = image.resize((size, size), resample)
    return image, round(hot_x * scale), round(hot_y * scale)


def convert(source, out_dir, state):
    """Saves one state of a cursor and returns its generated fields for cursors.yml."""
    data = source.read_bytes()
    if data[:4] == b"RIFF":
        frames, delays = read_ani(data)
    else:
        frames, delays = [read_cur(data)], None

    def save(frame, name):
        image, hot_x, hot_y = pick(frame, CURSOR_SIZE)
        image.save(out_dir / f"{name}.png")
        pick(frame, CURSOR_SIZE * 2)[0].save(out_dir / f"{name}@2x.png")
        return [hot_x, hot_y]

    entry = {"hotspot": save(frames[0], state)}
    if len(frames) > 1:
        for n, frame in enumerate(frames, 1):
            save(frame, f"{state}-{n}")
        entry["frames"] = len(frames)
        entry["delay"] = delays[0]
        previews = [pick(frame, PREVIEW_SIZE)[0] for frame in frames]
        previews[0].save(out_dir / f"{state}-preview.png", save_all=True, append_images=previews[1:],
                         duration=delays, loop=0)
    return entry


def default_name(name):
    return re.sub(r"\s+(Animated\s+)?Cursor$", "", name).strip()


def find_pairs(source_dir, cursors):
    """Adds cursors from a folder of "<Name>--cursor--..." / "<Name>--pointer--..." files that aren't listed yet."""
    listed = {c["cursor"]["file"] for c in cursors}
    pairs = {}
    for path in Path(source_dir).iterdir():
        match = re.match(r"(.+?)--(cursor|pointer)--", path.name)
        if match and path.suffix.lower() in (".cur", ".ani"):
            pairs.setdefault(match.group(1), {})[match.group(2)] = path.resolve().relative_to(ROOT).as_posix()
    for name, files in sorted(pairs.items()):
        if "cursor" not in files:
            print(f"skipping {name}: no --cursor-- file")
        elif files["cursor"] not in listed:
            cursors.append({
                "id": re.sub(r"[^a-z0-9]+", "-", default_name(name).lower()).strip("-"),
                "name": default_name(name),
                "cursor": {"file": files["cursor"]},
                "pointer": {"file": files.get("pointer", files["cursor"])},
            })


def main(source_dir=None):
    cursors = yaml.safe_load(DATA_FILE.read_text()) or [] if DATA_FILE.exists() else []
    if source_dir:
        find_pairs(source_dir, cursors)

    for cursor in cursors:
        out_dir = OUT_DIR / cursor["id"]
        shutil.rmtree(out_dir, ignore_errors=True)
        out_dir.mkdir(parents=True)
        cursor_file = cursor["cursor"]["file"]
        pointer_file = (cursor.get("pointer") or {}).get("file", cursor_file)
        cursor["cursor"] = {"file": cursor_file, **convert(ROOT / cursor_file, out_dir, "cursor")}
        cursor["pointer"] = {"file": pointer_file, **convert(ROOT / pointer_file, out_dir, "pointer")}
        print(f"converted {cursor['id']}")

    header = (
        "# Cursors offered in the cursor menu (settings box), in this order. See _scripts/convert_cursors.py.\n"
        "# To add one, add an entry with `id`, `name` (the title in the menu), and `file:` under `cursor:` (normal) and\n"
        "# `pointer:` (hovering a link; optional), then run the script. It fills in the rest:\n"
        "#   hotspot  the pixel (x, y) that does the clicking\n"
        "#   frames   number of animation frames, shown `delay` milliseconds apart (animated cursors only)\n\n"
    )
    DATA_FILE.write_text(header + yaml.safe_dump(cursors, sort_keys=False, default_flow_style=None, width=120))


if __name__ == "__main__":
    if len(sys.argv) > 2:
        sys.exit(__doc__)
    main(sys.argv[1] if len(sys.argv) == 2 else None)
