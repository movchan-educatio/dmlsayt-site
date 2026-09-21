#!/usr/bin/env python3
"""Normalize visible Ukrainian typography and fill empty Markdown image alts."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = ROOT / "content" / "pages"


def title_map():
    data = json.loads((ROOT / "content" / "site.json").read_text(encoding="utf-8"))
    result = {}

    def walk(items):
        for item in items:
            if item.get("slug"):
                result[item["slug"]] = item.get("title", item["slug"])
            walk(item.get("children", []))

    walk(data.get("nav", []))
    return result


def normalize_quotes_outside_html(text):
    parts = re.split(r"(<[^>]+>)", text)
    quoted = re.compile(r'"([^"\n]*[А-Яа-яІіЇїЄєҐґ][^"\n]*)"')
    for index in range(0, len(parts), 2):
        parts[index] = quoted.sub(lambda m: "«" + m.group(1) + "»", parts[index])
    return "".join(parts)


def main():
    titles = title_map()
    changed = 0
    alt_count = 0
    for path in sorted(PAGES.glob("*.md")):
        original = path.read_text(encoding="utf-8")
        title = titles.get(path.stem, path.stem.replace("-", " ").capitalize())
        image_number = 0

        def fill_alt(match):
            nonlocal image_number, alt_count
            image_number += 1
            alt_count += 1
            suffix = "" if image_number == 1 else f" — {image_number}"
            return f"![Фото: {title}{suffix}]("

        updated = re.sub(r"!\[\]\(", fill_alt, original)
        updated = normalize_quotes_outside_html(updated)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1

    print(f"Updated {changed} pages; filled {alt_count} empty image descriptions.")


if __name__ == "__main__":
    main()
