#!/usr/bin/env python3
"""Shrinks the generated brand images (needs Pillow).

  optimize.py webp IN.png OUT.webp [--quality 88]   lossy WebP, for the README screenshots
  optimize.py png  IN.png OUT.png  [--max-kb 300]   optimised PNG; falls back to an adaptive palette
                                                    (libimagequant, dithered) when true colour would be too big
"""
import argparse
import io
import sys

from PIL import Image, features


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kind", choices=["webp", "png"])
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--quality", type=int, default=88)
    ap.add_argument("--max-kb", type=int, default=0)
    args = ap.parse_args()

    im = Image.open(args.src)
    transparent = im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 255
    im = im.convert("RGBA" if transparent else "RGB")

    if args.kind == "webp":
        im.save(args.dst, "WEBP", quality=args.quality, method=6)
        return 0

    data = png_bytes(im)
    colors = 256
    if args.max_kb and not transparent and len(data) > args.max_kb * 1024:
        if features.check("libimagequant"):
            method = Image.Quantize.LIBIMAGEQUANT
        else:
            print("warning: this Pillow has no libimagequant; gradients will look posterised", file=sys.stderr)
            method = Image.Quantize.MEDIANCUT
        while len(data) > args.max_kb * 1024 and colors >= 32:
            data = png_bytes(im.quantize(colors=colors, method=method, dither=Image.Dither.FLOYDSTEINBERG))
            colors //= 2
    if args.max_kb and len(data) > args.max_kb * 1024:
        print(f"{args.dst}: still {len(data) // 1024} KB (limit {args.max_kb} KB)", file=sys.stderr)
        return 1
    with open(args.dst, "wb") as f:
        f.write(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
