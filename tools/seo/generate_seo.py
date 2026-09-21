#!/usr/bin/env python3
"""Generate robots.txt and sitemap.xml from the real navigation tree."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
SITE_JSON = ROOT / "content" / "site.json"
BASE_URL = "https://movchan-educatio.github.io/dmlsayt-site/"


def nav_slugs(items):
    for item in items:
        slug = item.get("slug")
        if slug:
            yield slug
        yield from nav_slugs(item.get("children", []))


def main():
    data = json.loads(SITE_JSON.read_text(encoding="utf-8"))
    home = data.get("site", {}).get("home", "golovna")
    slugs = list(dict.fromkeys(nav_slugs(data.get("nav", []))))
    urls = [BASE_URL]
    urls.extend(BASE_URL + "?page=" + quote(slug, safe="") for slug in slugs if slug != home)

    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        sitemap.extend(["  <url>", f"    <loc>{escape(url)}</loc>", "  </url>"])
    sitemap.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    robots = (
        "User-agent: *\n"
        "Allow: /dmlsayt-site/\n"
        "Disallow: /dmlsayt-site/admin/\n\n"
        f"Sitemap: {BASE_URL}sitemap.xml\n"
    )
    (ROOT / "robots.txt").write_text(robots, encoding="utf-8")
    print(f"Generated robots.txt and sitemap.xml with {len(urls)} public URLs.")


if __name__ == "__main__":
    main()
