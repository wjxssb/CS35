#!/usr/bin/env python3
"""Generate a realistic-looking course schedule image for OCR tests/E2E.

Each course is rendered as a small block, which OCRs cleanly:

    CS 35L  Intro to Programming in Python
    Instructor: Paul R. Eggert
    Days: MW   Time: 2:00 PM - 3:50 PM   Location: ENG 1102

Usage:
  python3 tools/make_sample_schedule.py out.png "Frank Zhang" \
    --course "CS 35L|Intro to Programming in Python|Paul R. Eggert|MW|2:00 PM - 3:50 PM|ENG 1102"
"""
import argparse
from PIL import Image, ImageDraw, ImageFont


def get_font(size, bold=False):
    candidates = [
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans-{'Bold' if bold else 'Regular'}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("name")
    ap.add_argument("--course", action="append", default=[])
    args = ap.parse_args()

    if not args.course:
        args.course = [
            "CS 35L|Intro to Programming in Python|Paul R. Eggert|MW|2:00 PM - 3:50 PM|ENG 1102",
            "CS 111|Data Science|Christian Reiher|TR|10:00 AM - 11:50 AM|HEO 1050",
            "MATH 131A|Linear Algebra|D. G. Lu|HW|1:00 PM - 2:50 PM|PEP 338",
        ]

    rows = [c.split("|") for c in args.course]
    rows = [r + [""] * (6 - len(r)) for r in rows]

    W = 1200
    block_h = 168
    header_h = 140
    H = header_h + block_h * len(rows) + 80

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    f_title = get_font(46, bold=True)
    f_name = get_font(32)
    f_course = get_font(40, bold=True)
    f_label = get_font(32)

    d.rectangle([0, 0, W, header_h], fill="#1f3a8a")
    d.text((36, 22), "University of California, Los Angeles", font=f_title, fill="white")
    d.text((36, 84), f"Student: {args.name}    Term: Fall 2026", font=f_name, fill="#e5e7eb")

    y = header_h + 40
    for code, title, instructor, days, time, location in rows:
        d.text((40, y), f"{code}   {title}".strip(), font=f_course, fill="#111827")
        d.text((40, y + 56), f"Instructor: {instructor}".rstrip(), font=f_label, fill="#374151")
        d.text((40, y + 112),
               f"Days: {days}    Time: {time}    Location: {location}".strip(),
               font=f_label, fill="#374151")
        y += block_h

    img.save(args.out)
    print(f"wrote {args.out} ({W}x{H})")


if __name__ == "__main__":
    main()
