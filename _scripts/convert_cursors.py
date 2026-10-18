"""Converts Windows cursor files into PNGs that browsers can use, and lists them in _data/cursors.yml.

Each cursor's original files go in their own folder, assets/cursors/originals/<id>/, named by state:
  cursor.cur or cursor.ani   the normal cursor (required)
  link.cur or link.ani       hovering a link (optional; without it the normal cursor is used)
  text.cur or text.ani       hovering text (optional; without it the normal cursor is used)

Browsers can't use .ani (animated) cursors and support .cur unevenly, so each state is saved as PNGs:
  assets/cursors/web/<id>/<state>.png           32px cursor (the first frame, if animated)
  assets/cursors/web/<id>/<state>-<n>.png       32px animation frames (animated cursors only)
  assets/cursors/web/<id>/<state>-preview.png   64px animated PNG for the cursor menu (animated cursors only)
plus a 64px "@2x" copy of each 32px image for sharp cursors on high-resolution screens. A cursor can be made bigger
with `size:` in _data/cursors.yml (in pixels, instead of 32).

New folders are added to the end of _data/cursors.yml, titled from the folder name. Your edits there (`name`,
`source`, `size`, `effect`, `static`, and the order) are kept when you re-run this; entries whose folder is gone are removed.

Usage (needs Pillow and PyYAML):
  python3 _scripts/convert_cursors.py
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
SOURCE_DIR = ROOT / "assets/cursors/originals"
OUT_DIR = ROOT / "assets/cursors/web"
STATES = ("cursor", "link", "text")
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
        elif struct.unpack("<H", image_data[14:16])[0] == 32:
            image = read_bmp32(image_data, width)
        elif struct.unpack("<H", image_data[14:16])[0] == 1:
            image = read_bmp1(image_data, width)
        else:
            # A BMP image: wrap it in a one-image .ico file, which Pillow can decode (including its transparency mask).
            entry = data[6 + 16 * i:10 + 16 * i] + struct.pack("<HHII", 1, 0, length, 22)
            ico = struct.pack("<HHH", 0, 1, 1) + entry + image_data
            image = Image.open(io.BytesIO(ico)).convert("RGBA")
        images[width] = (image, hot_x, hot_y)
    return images


def read_bmp32(data, width):
    """Decodes a 32-bit BMP cursor image. Pillow ignores these images' own transparency (alpha), so decode it here."""
    header_size, _, double_height = struct.unpack("<Iii", data[:12])
    height = abs(double_height) // 2  # cursor BMPs list the image plus its mask as one double-height image
    pixels = data[header_size:header_size + width * height * 4]
    image = Image.frombuffer("RGBA", (width, height), pixels, "raw", "BGRA", 0, -1)
    if image.getextrema()[3][1] == 0:
        # No alpha at all: transparency comes from the 1-bit mask after the pixels instead (1 = transparent).
        row = (width + 31) // 32 * 4
        mask = data[header_size + len(pixels):]
        alpha = Image.frombuffer("1", (width, height), mask, "raw", "1;I", row, -1)
        image.putalpha(alpha)
    return image


def read_bmp1(data, width):
    """Decodes a black-and-white BMP cursor image. These can have "invert the screen" pixels (like the classic text
    I-beam), which browsers can't do; they're drawn white with a black outline, like an inverted cursor on this
    site's black pages."""
    header_size, _, double_height = struct.unpack("<Iii", data[:12])
    height = abs(double_height) // 2
    colors = struct.unpack("<I", data[32:36])[0] or 2
    palette = [tuple(data[header_size + 4 * i:header_size + 4 * i + 3][::-1]) for i in range(colors)]
    row = (width + 31) // 32 * 4
    image_start = header_size + 4 * colors

    def bit(plane_start, x, y):
        byte = data[plane_start + (height - 1 - y) * row + x // 8]  # rows are stored bottom to top
        return (byte >> (7 - x % 8)) & 1

    image = Image.new("RGBA", (width, height))
    inverted = set()
    for y in range(height):
        for x in range(width):
            color, transparent = bit(image_start, x, y), bit(image_start + row * height, x, y)
            if not transparent:
                image.putpixel((x, y), palette[color] + (255,))
            elif color:
                inverted.add((x, y))
    for x, y in inverted:
        image.putpixel((x, y), (255, 255, 255, 255))
    for x, y in inverted:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and image.getpixel((nx, ny))[3] == 0:
                image.putpixel((nx, ny), (0, 0, 0, 255))
    return image


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


def convert(source, out_dir, state, static=False, size=CURSOR_SIZE):
    """Saves one state of a cursor and returns its generated fields for cursors.yml.
    static: for an animated cursor, keep only the first frame.
    size: the cursor's size in pixels."""
    data = source.read_bytes()
    if data[:4] == b"RIFF":
        frames, delays = read_ani(data)
    else:
        frames, delays = [read_cur(data)], None
    if static:
        frames = frames[:1]

    def save(frame, name):
        image, hot_x, hot_y = pick(frame, size)
        image.save(out_dir / f"{name}.png")
        pick(frame, size * 2)[0].save(out_dir / f"{name}@2x.png")
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


def find_file(folder, state):
    for extension in (".cur", ".ani"):
        if (folder / (state + extension)).exists():
            return folder / (state + extension)
    return None


def main():
    listed = yaml.safe_load(DATA_FILE.read_text()) or [] if DATA_FILE.exists() else []
    folders = sorted(path.name for path in SOURCE_DIR.iterdir() if path.is_dir())
    cursors = [c for c in listed if c["id"] in folders]
    for gone in sorted({c["id"] for c in listed} - set(folders)):
        print(f"removed {gone}: no folder in {SOURCE_DIR.relative_to(ROOT)}")
    for new in sorted(set(folders) - {c["id"] for c in listed}):
        cursors.append({"id": new, "name": new.replace("-", " ").title()})

    shutil.rmtree(OUT_DIR, ignore_errors=True)
    for cursor in cursors:
        folder, out_dir = SOURCE_DIR / cursor["id"], OUT_DIR / cursor["id"]
        if not find_file(folder, "cursor"):
            sys.exit(f"{folder.relative_to(ROOT)} needs a cursor.cur or cursor.ani")
        out_dir.mkdir(parents=True)
        for state in STATES:
            source = find_file(folder, state) or (find_file(folder, "cursor") if state == "link" else None)
            if not source:
                cursor.pop(state, None)
                continue
            static = (cursor.get(state) or {}).get("static")
            size = cursor.get("size", CURSOR_SIZE)
            cursor[state] = {**({"static": True} if static else {}), **convert(source, out_dir, state, static, size)}
        # Keep a tidy key order: id, name, source, size, effect, then the states.
        order = ["id", "name", "source", "size", "effect", *STATES]
        cursor_items = sorted(cursor.items(), key=lambda item: order.index(item[0]) if item[0] in order else 99)
        cursor.clear()
        cursor.update(cursor_items)
        print(f"converted {cursor['id']}")

    header = (
        "# Cursors offered in the cursor menu (settings box), in this order. See _scripts/convert_cursors.py.\n"
        "# Each one's original files are in assets/cursors/originals/<id>/ (cursor, plus optional link and text).\n"
        "# You can edit:\n"
        "#   name     the title in the menu\n"
        "#   source   where the cursor came from (just for reference; not shown on the site)\n"
        "#   size     the cursor's size in pixels (default 32; cursors over 32 can switch to the normal arrow near\n"
        "#            the edge of the browser window)\n"
        "#   effect   a special effect (see _includes/geo/cursor-effects.html): `paint` (hold the mouse button and drag\n"
        "#            to draw), `saber` (a short glowing red trail) or `explosion` (an explosion where you click)\n"
        "#   static   put `static: true` under a state to use just the first frame of an animated cursor (animation\n"
        "#            can flicker)\n"
        "# and reorder entries. The script fills in the rest:\n"
        "#   hotspot  the pixel (x, y) that does the clicking\n"
        "#   frames   number of animation frames, shown `delay` milliseconds apart (animated cursors only)\n\n"
    )
    DATA_FILE.write_text(header + yaml.safe_dump(cursors, sort_keys=False, default_flow_style=None, width=120))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(__doc__)
    main()
