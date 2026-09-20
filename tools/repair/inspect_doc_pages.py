#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/repair/inspect_doc_pages.py
Детальний аналіз усіх 28 сторінок із документами Drive/Docs.
"""

import os
import sys
import re
import json
import struct

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
REPORT_JSON = os.path.join(ROOT_DIR, "tools", "repair", "audit_diagnostic.json")

def get_image_size(path):
    try:
        with open(path, 'rb') as f:
            head = f.read(32)
            if head.startswith(b'\x89PNG\r\n\x1a\n') and len(head) >= 24:
                w, h = struct.unpack('>II', head[16:24])
                return w, h
    except Exception:
        pass
    return None

with open(REPORT_JSON, "r", encoding="utf-8") as f:
    diag = json.load(f)

doc_pages = sorted(list(diag["pages_with_docs"].keys()))
print(f"Всього сторінок із документами: {len(doc_pages)}")

for slug in doc_pages:
    fpath = os.path.join(PAGES_DIR, slug + ".md")
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Збираємо всі зображення та перевіряємо їх розмір
    images = re.findall(r'!\[(.*?)\]\((.*?)\)', content)
    small_icons = []
    normal_images = []
    for alt, src in images:
        clean_src = src.split('?')[0].split('#')[0].strip()
        full_p = os.path.join(ROOT_DIR, clean_src)
        sz = get_image_size(full_p)
        if sz and sz[0] <= 48 and sz[1] <= 48:
            small_icons.append((alt, clean_src, sz))
        else:
            normal_images.append((alt, clean_src, sz))

    # Збираємо iframes
    iframes = re.findall(r'<iframe\s+[^>]*?src=["\']([^"\']+)["\'][^>]*?(?:title=["\']([^"\']*)["\'])?[^>]*?>.*?</iframe>', content, re.DOTALL)
    # Також шукаємо завантаження
    downloads = re.findall(r'\[(Завантажити файл:[^\]]*)\]\((https://drive\.google\.com/uc\?[^\)]+)\)', content)

    print(f"\n--- {slug} ---")
    print(f"  Документів: {diag['pages_with_docs'][slug]['count']}")
    print(f"  Іконки 32x32: {len(small_icons)} {[s[1] for s in small_icons]}")
    print(f"  Звичайні зображення: {len(normal_images)}")
    print(f"  Iframes: {len(iframes)}")
    print(f"  Download посилань: {len(downloads)}")
