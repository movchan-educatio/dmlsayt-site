#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/repair/inspect_empty_pages.py
Детальний аналіз сторінок:
- pro-nas
- uchniam-ta-batkam
- zno-dpa-nmt
- symvolika-litseiu
- pamiatka-dii-pid-chas-syhnalu-povitriana-tryvoha
- ustanovchi-dokumenty
- vakansii
"""

import os
import sys
import json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRAPED_JSON = os.path.join(ROOT_DIR, "tools", "audit", "scraped_old_pages.json")
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")

with open(SCRAPED_JSON, "r", encoding="utf-8") as f:
    data = json.load(f)

pages = [
    'pro-nas',
    'uchniam-ta-batkam',
    'zno-dpa-nmt',
    'symvolika-litseiu',
    'pamiatka-dii-pid-chas-syhnalu-povitriana-tryvoha',
    'ustanovchi-dokumenty',
    'vakansii'
]

for p in pages:
    info = data.get(p, {})
    cur_f = os.path.join(PAGES_DIR, p + ".md")
    cur_content = ""
    if os.path.exists(cur_f):
        with open(cur_f, "r", encoding="utf-8", errors="ignore") as f:
            cur_content = f.read()

    print(f"\n==========================================")
    print(f"PAGE: {p}")
    print(f"Current local file content ({len(cur_content)} chars):")
    print(cur_content[:300] if cur_content else "(EMPTY)")
    print(f"\nScraped Old Page:")
    print(f"  Title: {info.get('pageTitle')}")
    print(f"  Headings: {info.get('headings')}")
    print(f"  Text ({len(info.get('text', ''))} chars): {info.get('text', '')[:300]}")
    print(f"  Images ({len(info.get('images', []))}):")
    for im in info.get('images', []):
        print(f"    - src: {im.get('src')[:80]}... alt: '{im.get('alt')}' clickable: {im.get('isClickable')} parentHref: {im.get('parentHref')}")
    print(f"  Iframes ({len(info.get('iframes', []))}):")
    for ifr in info.get('iframes', []):
        print(f"    - src: {ifr.get('src')} title: '{ifr.get('title')}' ariaLabel: '{ifr.get('ariaLabel')}'")
    print(f"  Links ({len(info.get('links', []))}):")
    for lnk in info.get('links', []):
        print(f"    - text: '{lnk.get('text')}' href: {lnk.get('href')}")
