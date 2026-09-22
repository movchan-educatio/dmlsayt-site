#!/usr/bin/env python3
"""Fast release-quality gate for the static school site."""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
PAGES = ROOT / "content" / "pages"
ALLOWED_IFRAME_HOSTS = {
    "www.youtube.com", "youtube.com", "www.youtube-nocookie.com",
    "drive.google.com", "docs.google.com", "forms.gle",
    "www.google.com", "maps.google.com", "www.facebook.com", "player.vimeo.com",
}
errors = []

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def require(condition, message):
    if not condition:
        errors.append(message)


def slugs(items):
    for item in items:
        if item.get("slug"):
            yield item["slug"]
        yield from slugs(item.get("children", []))


def main():
    site = json.loads((ROOT / "content" / "site.json").read_text(encoding="utf-8"))
    nav = list(slugs(site.get("nav", [])))
    require(len(nav) == len(set(nav)), "Навігація містить дублікати slug")
    files = {p.stem for p in PAGES.glob("*.md")}
    require(set(nav) == files, f"Меню і Markdown-файли не збігаються: menu-only={set(nav)-files}, file-only={files-set(nav)}")

    for path in PAGES.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        require(bool(text.strip()), f"Порожня сторінка: {path.name}")
        require("![](" not in text, f"Зображення без alt: {path.name}")
        for src in re.findall(r'!?\[[^\]]*\]\((uploads/[^)#?]+)', text):
            require((ROOT / src).is_file(), f"Відсутній локальний файл: {path.name} -> {src}")
        for tag in re.findall(r"<iframe\b[^>]*>", text, flags=re.I):
            src_match = re.search(r'\bsrc=["\']([^"\']+)', tag, flags=re.I)
            title_match = re.search(r'\btitle=["\'][^"\']+', tag, flags=re.I)
            require(bool(src_match), f"iframe без src: {path.name}")
            require(bool(title_match), f"iframe без title: {path.name}")
            require("loading=\"lazy\"" in tag or "loading='lazy'" in tag, f"iframe без lazy loading: {path.name}")
            if src_match:
                host = urlparse(src_match.group(1)).hostname or ""
                require(host in ALLOWED_IFRAME_HOSTS, f"Недозволений iframe host: {path.name} -> {host}")

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for needle in ('name="description"', 'name="robots"', 'rel="canonical"',
                   'property="og:title"', 'name="twitter:card"', 'application/ld+json'):
        require(needle in html, f"index.html не містить SEO-елемент: {needle}")

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    require("Sitemap: https://movchan-educatio.github.io/dmlsayt-site/sitemap.xml" in robots,
            "robots.txt не містить правильний Sitemap")
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    sitemap_urls = [el.text for el in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    require(len(sitemap_urls) == len(nav), f"Sitemap має {len(sitemap_urls)} URL замість {len(nav)}")
    require(len(sitemap_urls) == len(set(sitemap_urls)), "Sitemap містить дублікати URL")
    require(not any("#/" in url for url in sitemap_urls), "Sitemap містить hash URL")
    require(not any("#" in url for url in sitemap_urls), "Sitemap містить fragment URL")
    require(not any("/admin" in url for url in sitemap_urls), "Sitemap містить admin URL")
    require(all(url.startswith("https://movchan-educatio.github.io/dmlsayt-site/") for url in sitemap_urls),
            "Sitemap містить URL поза production-сайтом")
    require("seoFiles" in (ROOT / "admin" / "admin-core.js").read_text(encoding="utf-8"),
            "Admin publish не оновлює sitemap автоматично")

    app = (ROOT / "assets" / "js" / "app.js").read_text(encoding="utf-8")
    require("?page=" in app and "function parseRoute" in app, "Не знайдено індексовану query-маршрутизацію")
    rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")
    require(bool(re.search(r"allow\s+[^;]*\bread\b[^;]*:\s*if\s+request\.auth\s*!=\s*null", rules)),
            "Firestore read не захищено авторизацією")
    require("allow read, write: if true" not in rules, "Firestore має публічний read/write")

    if errors:
        print("QUALITY CHECK FAILED")
        for error in errors:
            print(" -", error)
        return 1
    print(f"QUALITY CHECK PASSED: {len(nav)} pages, {len(sitemap_urls)} sitemap URLs, SEO/accessibility/security gates OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
