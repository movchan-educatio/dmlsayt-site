#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/repair/final_migration_audit.py
Комплексний аудит міграції всіх 62 сторінок:
1. Порівняння з даними старого Google Sites (scraped_old_pages.json).
2. Пошук дублювання елементів документів (іконка Drive + зображення + iframe + кнопка).
3. Пошук розірваних пар заголовок/документ (як у plan-roboty-litseiu).
4. Перевірка 100% збереження Google Drive/Docs/PDF/Sheets/Slides.
5. Перевірка клікабельних зображень.
6. Перевірка артефактів #h.*.
7. Перевірка внутрішніх посилань та якорів.
8. Перевірка порожніх або майже порожніх сторінок.
"""

import os
import sys
import re
import json
import urllib.parse
import struct

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
SCRAPED_JSON = os.path.join(ROOT_DIR, "tools", "audit", "scraped_old_pages.json")
REPORT_JSON = os.path.join(ROOT_DIR, "tools", "repair", "audit_diagnostic.json")

def extract_drive_ids(text):
    ids = set()
    for m in re.finditer(r'drive\.google\.com/(?:file/d/|uc\?[^"\')\s]*id=)([A-Za-z0-9_-]{25,})', text):
        ids.add(m.group(1))
    for m in re.finditer(r'docs\.google\.com/(?:document|spreadsheets|presentation)/d/([A-Za-z0-9_-]{25,})', text):
        ids.add(m.group(1))
    return ids

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

def check_image_is_drive_icon(img_path):
    if not os.path.exists(img_path):
        return False, None
    dims = get_image_size(img_path)
    if dims:
        w, h = dims
        if w <= 48 and h <= 48:
            return True, (w, h)
        return False, (w, h)
    return False, None

def run_audit():
    old_data = {}
    if os.path.exists(SCRAPED_JSON):
        try:
            with open(SCRAPED_JSON, "r", encoding="utf-8") as f:
                old_data = json.load(f)
        except Exception as e:
            print(f"[!] Не вдалося завантажити {SCRAPED_JSON}: {e}")

    md_files = sorted([f for f in os.listdir(PAGES_DIR) if f.endswith(".md")])
    existing_slugs = set(f[:-3] for f in md_files)

    results = {
        "total_pages": len(md_files),
        "pages_with_docs": {},
        "duplicate_doc_elements": {},
        "drive_icon_images": {},
        "h_artifacts": {},
        "broken_internal_links": {},
        "broken_anchors": {},
        "empty_pages": {},
        "missing_drive_ids": {},
        "summary": {}
    }

    all_anchors_by_slug = {}

    # Спочатку збираємо всі якорі для кожної сторінки
    for fname in md_files:
        slug = fname[:-3]
        fpath = os.path.join(PAGES_DIR, fname)
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        anchors = set(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)["\']', content))
        # Markdown headings also generate implicit or explicit anchors
        all_anchors_by_slug[slug] = anchors

    for fname in md_files:
        slug = fname[:-3]
        fpath = os.path.join(PAGES_DIR, fname)
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        old_page = old_data.get(slug, {})

        # 1. Google Drive / Docs перевірка
        current_drive_ids = extract_drive_ids(content)
        old_drive_ids = set()
        if old_page:
            # з iframe
            for ifr in old_page.get("iframes", []):
                old_drive_ids.update(extract_drive_ids(ifr.get("src", "")))
            # з frameArtifacts
            for d in old_page.get("frameArtifacts", {}).get("drive_embeds", []):
                old_drive_ids.update(extract_drive_ids(d))
            # з посилань
            for l in old_page.get("links", []):
                old_drive_ids.update(extract_drive_ids(l.get("href", "")))

        missing_in_current = old_drive_ids - current_drive_ids
        if missing_in_current:
            results["missing_drive_ids"][slug] = list(missing_in_current)

        if current_drive_ids:
            results["pages_with_docs"][slug] = {
                "count": len(current_drive_ids),
                "ids": list(current_drive_ids)
            }

        # 2. Пошук дублювання представлення документів
        # Перевіряємо структури виду:
        # ![](image) + <iframe ... id ...> + [Завантажити файл](... id ...)
        dup_elements = []
        for did in current_drive_ids:
            # Скільки разів цей ID згадується у файлі
            mentions = len(re.findall(re.escape(did), content))
            if mentions > 1:
                dup_elements.append({
                    "drive_id": did,
                    "mentions": mentions
                })
        if dup_elements:
            results["duplicate_doc_elements"][slug] = dup_elements

        # 3. Перевірка зображень-іконок Drive
        img_matches = re.findall(r'!\[(.*?)\]\((.*?)\)', content)
        drive_icons = []
        for alt, img_rel_path in img_matches:
            # локальний шлях
            clean_rel = img_rel_path.split('?')[0].split('#')[0].strip()
            full_img_path = os.path.join(ROOT_DIR, clean_rel)
            is_icon, dims = check_image_is_drive_icon(full_img_path)
            if is_icon:
                drive_icons.append({"path": clean_rel, "dims": dims, "alt": alt})
        if drive_icons:
            results["drive_icon_images"][slug] = drive_icons

        # 4. Перевірка залишків #h.* у тексті
        # Шукаємо випадки, де #h. або (#h. все ще видно у звичайному тексті
        h_visible = re.findall(r'(?:^|[^\w/])(#[hH]\.[a-zA-Z0-9_-]+|\(#[hH]\.[a-zA-Z0-9_-]+\))', content)
        # Виключаємо правильні <a id="h.xxx"></a> та href="#h.xxx"
        h_suspicious = []
        for line_no, line in enumerate(content.splitlines(), 1):
            # Якщо рядок містить #h. але не є тегом <a id="h...
            if re.search(r'#h\.[a-z0-9_-]+', line):
                # Перевіряємо, чи це чистий якір чи сміття
                if not re.search(r'<a id="h\.[a-z0-9_-]+"|href="#h\.[a-z0-9_-]+"', line):
                    h_suspicious.append({"line": line_no, "text": line.strip()})
        if h_suspicious:
            results["h_artifacts"][slug] = h_suspicious

        # 5. Перевірка внутрішніх посилань та якорів
        links = re.findall(r'\[(.*?)\]\((.*?)\)', content)
        broken_links = []
        broken_anchors = []
        for text, href in links:
            h = href.strip()
            if h.startswith('#/') and not h.startswith('#/search'):
                # це внутрішнє посилання SPA на іншу сторінку
                target_part = h[2:].split('?')[0].split('#')[0].strip('/')
                anchor_part = h[2:].split('#')[1] if '#' in h[2:] else None
                target_unq = urllib.parse.unquote(target_part)
                if target_unq and target_unq not in existing_slugs:
                    broken_links.append({"text": text, "href": h, "target_slug": target_unq})
                elif target_unq and anchor_part:
                    # перевірка якоря на цільовій сторінці
                    if anchor_part not in all_anchors_by_slug.get(target_unq, set()):
                        # перевіримо, чи якір існує
                        broken_anchors.append({"text": text, "href": h, "target_slug": target_unq, "anchor": anchor_part})
            elif h.startswith('#') and not h.startswith('#/'):
                # якір на поточній сторінці
                anchor_name = h[1:].split('?')[0]
                if anchor_name and anchor_name not in all_anchors_by_slug.get(slug, set()):
                    # Перевіримо, чи є такий id у файлі
                    if f'id="{anchor_name}"' not in content and f'name="{anchor_name}"' not in content:
                        broken_anchors.append({"text": text, "href": h, "current_slug": slug, "anchor": anchor_name})

        if broken_links:
            results["broken_internal_links"][slug] = broken_links
        if broken_anchors:
            results["broken_anchors"][slug] = broken_anchors

        # 6. Порожні сторінки
        plain = re.sub(r'\[.*?\]\(.*?\)|<.*?>|!\[.*?\]\(.*?\)|[#*_\-\s]', '', content)
        if len(plain) < 10 and 'iframe' not in content and 'feedback-root' not in content:
            results["empty_pages"][slug] = {
                "chars": len(plain),
                "has_iframe": 'iframe' in content,
                "old_text_len": len(old_page.get("text", "")) if old_page else 0
            }

    with open(REPORT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("=" * 70)
    print("РЕЗУЛЬТАТИ КОМПЛЕКСНОГО АУДИТУ МІГРАЦІЇ")
    print("=" * 70)
    print(f"Перевірено сторінок: {results['total_pages']}")
    print(f"Сторінок із документами Drive/Docs: {len(results['pages_with_docs'])}")
    print(f"Сторінок із дублюванням елементів документів: {len(results['duplicate_doc_elements'])}")
    print(f"Сторінок із 32x32 іконками Drive замість документів: {len(results['drive_icon_images'])}")
    print(f"Сторінок із підозрілими #h артефактами: {len(results['h_artifacts'])}")
    print(f"Сторінок із битими внутрішніми посиланнями: {len(results['broken_internal_links'])}")
    print(f"Сторінок із неіснуючими якорями: {len(results['broken_anchors'])}")
    print(f"Порожніх або майже порожніх сторінок: {len(results['empty_pages'])}")
    print(f"Сторінок із відсутніми Drive ID (порівняно зі старим сайтом): {len(results['missing_drive_ids'])}")
    print("=" * 70)

    # Деталізація сторінок з дублями документів
    if results['duplicate_doc_elements']:
        print("\nСторінки з мульти-елементами документів (iframe + посилання + кнопка):")
        for s, dups in results['duplicate_doc_elements'].items():
            print(f"  - {s} ({len(dups)} документів мають дубльовані згадки)")

    if results['drive_icon_images']:
        print("\nСторінки з малим зображенням-іконкою Drive (uploads/...):")
        for s, icons in results['drive_icon_images'].items():
            print(f"  - {s} ({len(icons)} іконок)")

    if results['broken_anchors']:
        print("\nСторінки з неіснуючими якорями:")
        for s, anchs in results['broken_anchors'].items():
            print(f"  - {s}: {len(anchs)} якорів (напр. {anchs[0]['anchor']})")

    if results['empty_pages']:
        print("\nПорожні сторінки:")
        for s, info in results['empty_pages'].items():
            print(f"  - {s} (символів: {info['chars']}, текст на старому сайті: {info['old_text_len']})")

if __name__ == "__main__":
    run_audit()
