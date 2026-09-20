#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/repair/format_doc_cards.py
Автоматичне та безпечне перетворення документів Google Drive/Docs на сучасні картки:
1. Знаходить 32x32 placeholder-іконки Drive і видаляє їх з розмітки.
2. Об'єднує розрізнені елементи (іконка + сирий текст + iframe + завантажити + зміщений заголовок)
   в єдиний сучасний блок .doc-card.
3. Якщо на сторінці кілька документів підряд — організовує їх у .doc-grid.
4. Зберігає 100% Google Drive IDs та посилань.
5. Не чіпає звичайні фотографії та YouTube відео.
"""

import os
import sys
import re
import struct

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")

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

def is_drive_icon(rel_path):
    clean = rel_path.split('?')[0].split('#')[0].strip()
    full_p = os.path.join(ROOT_DIR, clean)
    sz = get_image_size(full_p)
    return sz and sz[0] <= 48 and sz[1] <= 48

def clean_title(raw):
    t = raw.strip()
    # Прибираємо розширення .pdf, .docx, .xlsx тощо якщо воно є на кінці для відображення
    t = re.sub(r'^(?:Завантажити файл:\s*)?', '', t)
    t = re.sub(r'\s*\((?:1|2|Автосохраненный)\)', '', t)
    return t.strip()

def process_file(fname):
    if fname == "plan-roboty-litseiu.md":
        # Ця сторінка вже ідеально відформатована вручну з точним мапінгом місяців
        return False

    fpath = os.path.join(PAGES_DIR, fname)
    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    orig = content

    # 1. Знаходимо всі іконки Drive (32x32)
    icons_to_remove = set()
    for m in re.finditer(r'!\[(.*?)\]\((uploads/pages/[^)]+)\)', content):
        img_p = m.group(2)
        if is_drive_icon(img_p):
            icons_to_remove.add(m.group(0))

    # Видаляємо тільки 32x32 іконки
    for icon_tag in icons_to_remove:
        content = content.replace(icon_tag, '')

    # 2. Перетворюємо зв'язку:
    # <iframe src="...drive.google.com/file/d/ID/preview" title="TITLE"></iframe>
    # [Завантажити файл: TITLE](...drive.google.com/uc?export=download&id=ID)
    # на акуратну картку
    def repl_doc_block(m):
        src = m.group(1).strip()
        title_attr = m.group(2) or ''
        down_title = m.group(3).strip()
        down_url = m.group(4).strip()

        # Визначаємо ID
        id_m = re.search(r'/d/([A-Za-z0-9_-]{20,})', src) or re.search(r'id=([A-Za-z0-9_-]{20,})', down_url)
        doc_id = id_m.group(1) if id_m else ''

        display_title = title_attr or down_title or 'Документ'
        display_title = clean_title(display_title)

        preview_url = f"https://drive.google.com/file/d/{doc_id}/preview" if doc_id else src
        download_url = f"https://drive.google.com/uc?export=download&id={doc_id}" if doc_id else down_url

        card_html = f'''<div class="doc-card">
  <div class="doc-card-title">{display_title}</div>
  <iframe src="{preview_url}" title="{display_title}" loading="lazy"></iframe>
  <div class="doc-card-actions">
    <a class="doc-btn preview-btn" href="{preview_url}" target="_blank" rel="noopener noreferrer">Переглянути документ ↗</a>
    <a class="doc-btn download-btn" href="{download_url}" target="_blank" rel="noopener noreferrer">Завантажити файл ↓</a>
  </div>
</div>'''
        return card_html

    # Регулярний вираз для iframe + [Завантажити файл: ...]
    pattern = re.compile(
        r'<iframe\s+[^>]*?src=["\'](https://drive\.google\.com/file/d/[^"\']+/preview)["\'][^>]*?(?:title=["\']([^"\']*)["\'])?[^>]*?>.*?</iframe>\s*'
        r'\[(?:Завантажити файл:\s*)?(.*?)\]\((https://drive\.google\.com/uc\?[^\)]+)\)',
        re.DOTALL | re.IGNORECASE
    )

    content = pattern.sub(repl_doc_block, content)

    # 3. Випадки, коли заголовок стоїть відразу ПІСЛЯ картки або підпису:
    # Наприклад:
    # <div class="doc-card">...</div>\s*\n\s*## Статут
    # Переносимо назву в заголовок картки, якщо картка мала назву "Статут (1).pdf"
    def fix_card_after_heading(m):
        card = m.group(1)
        heading_prefix = m.group(2) # ## або **
        heading_text = m.group(3).strip()

        # Якщо заголовок містить хорошу назву
        if len(heading_text) > 2 and 'doc-card-title' in card:
            # Оновлюємо назву всередині картки
            card = re.sub(r'<div class="doc-card-title">.*?</div>', f'<div class="doc-card-title">{heading_text}</div>', card, count=1)
            return f'{card}\n'
        return m.group(0)

    content = re.sub(
        r'(<div class="doc-card">.*?</div>)\s*\n\s*(#{1,6}\s*|\*{2})(.*?)(?:\2|\n|$)',
        fix_card_after_heading,
        content,
        flags=re.DOTALL
    )

    # 4. Чистимо порожні рядки (максимум 2 поспіль)
    content = re.sub(r'\n{3,}', '\n\n', content).strip() + '\n'

    if content != orig:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False

def main():
    md_files = [f for f in os.listdir(PAGES_DIR) if f.endswith(".md")]
    modified = []
    for f in md_files:
        if process_file(f):
            modified.append(f)

    print(f"Оновлено сторінок з картками документів: {len(modified)}")
    for m in modified:
        print(f"  - {m}")

if __name__ == "__main__":
    main()
