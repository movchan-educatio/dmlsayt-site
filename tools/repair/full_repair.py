#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Повний автономний скрипт для відновлення втраченого контенту (ЕТАП 2):
1. Створює бекап content/pages/ -> content/pages_backup_before_stage2/
2. Відновлює всі підтверджені Google Drive / Docs документи (iframe + посилання на завантаження)
3. Відновлює оригінальну форму FormDesigner на сторінці «Зворотній зв'язок»
4. Відновлює цільові URL клікабельних зображень
5. Запобігає дублюванню вже наявного контенту
6. Виконує автоматичний повторний аудит та порівняння зі старим сайтом
7. Формує вичерпний підсумковий звіт
"""

import os
import sys
import json
import re
import shutil
import urllib.parse
from datetime import datetime

# Гарантуємо UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
BACKUP_DIR = os.path.join(ROOT_DIR, "content", "pages_backup_before_stage2")
REPAIR_DIR = os.path.join(ROOT_DIR, "tools", "repair")
AUDIT_DIR = os.path.join(ROOT_DIR, "tools", "audit")
SCRAPED_JSON = os.path.join(AUDIT_DIR, "scraped_old_pages.json")
AUDIT_RESULTS_JSON = os.path.join(AUDIT_DIR, "audit_results.json")
SOURCE_MAP_PATH = os.path.join(ROOT_DIR, "tools", "source_map.json")

os.makedirs(REPAIR_DIR, exist_ok=True)


def unwrap_google(url):
    if not url:
        return ""
    url = url.strip()
    p = urllib.parse.urlparse(url)
    if (p.netloc.endswith("google.com") or p.netloc == "google.com") and p.path == "/url":
        qs = urllib.parse.parse_qs(p.query)
        if "q" in qs and qs["q"]:
            return qs["q"][0]
    return url


def extract_drive_id(url):
    if not url:
        return None, None
    url = unwrap_google(url)
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?id=|uc\?export=download&id=)([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(1), "file"
    m = re.search(r"docs\.google\.com/(document|spreadsheets|presentation|forms)/d/([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(2), m.group(1)
    return None, None


def clean_title(title_or_label):
    if not title_or_label:
        return "Документ"
    t = title_or_label.strip()
    t = re.sub(r"^Drive,\s*", "", t)
    t = re.sub(r"^Документ:\s*", "", t)
    t = t.strip()
    return t if t else "Документ"


def backup_pages():
    print(f"\n[1/5] Створення резервної копії: {PAGES_DIR} -> {BACKUP_DIR}")
    if os.path.exists(BACKUP_DIR):
        shutil.rmtree(BACKUP_DIR)
    shutil.copytree(PAGES_DIR, BACKUP_DIR)
    backed_count = len(os.listdir(BACKUP_DIR))
    print(f"      Успішно створено резервну копію {backed_count} файлів.")


def restore_content():
    print("\n[2/5] Відновлення контенту з аудиторських даних...")
    if not os.path.exists(SCRAPED_JSON) or not os.path.exists(AUDIT_RESULTS_JSON):
        sys.exit(f"Помилка: не знайдено файлів аудиту {SCRAPED_JSON} або {AUDIT_RESULTS_JSON}")

    with open(SCRAPED_JSON, "r", encoding="utf-8") as f:
        scraped_data = json.load(f)

    with open(AUDIT_RESULTS_JSON, "r", encoding="utf-8") as f:
        audit_results = json.load(f)

    with open(SOURCE_MAP_PATH, "r", encoding="utf-8") as f:
        source_map = json.load(f)

    modified_files = []
    restored_stats = {
        "forms": 0,
        "drive_docs": 0,
        "clickable_images": 0,
        "embeds": 0
    }

    for res in audit_results:
        slug = res["slug"]
        local_file = os.path.join(PAGES_DIR, f"{slug}.md")
        if not os.path.exists(local_file):
            continue

        with open(local_file, "r", encoding="utf-8") as f:
            original_md = f.read()

        current_md = original_md
        page_scraped = scraped_data.get(slug, {})
        file_changed = False

        # ---------------- 1. ВІДНОВЛЕННЯ ФОРМИ ЗВОРОТНОГО ЗВ'ЯЗКУ ----------------
        if slug == "zvorotnii-zviazok":
            form_url = "https://formdesigner.com.ua/form/iframe/210703?center=1"
            if form_url not in current_md:
                form_embed = (
                    f'<iframe src="{form_url}" '
                    f'style="width:100%;height:680px;border:none;border-radius:8px;" '
                    f'title="Форма зворотного зв\'язку"></iframe>\n\n'
                )
                current_md = form_embed + current_md.strip() + "\n"
                file_changed = True
                restored_stats["forms"] += 1
                print(f"   [+] {slug}: відновлено форму FormDesigner")

        # ---------------- 2. ВІДНОВЛЕННЯ GOOGLE DRIVE / DOCS ----------------
        # Збираємо всі унікальні Drive документи з DOM старого сайту
        old_drive_items = []
        seen_drive_ids = set()

        # А. З iframes DOM
        for ifr in page_scraped.get("iframes", []):
            src = ifr.get("src", "")
            d_id, kind = extract_drive_id(src)
            if d_id and d_id not in seen_drive_ids:
                seen_drive_ids.add(d_id)
                title = clean_title(ifr.get("ariaLabel") or ifr.get("title") or "")
                old_drive_items.append({"id": d_id, "kind": kind, "title": title, "src": src})

        # Б. З frameArtifacts
        for fr_src in page_scraped.get("frameArtifacts", {}).get("drive_embeds", []):
            d_id, kind = extract_drive_id(fr_src)
            if d_id and d_id not in seen_drive_ids:
                seen_drive_ids.add(d_id)
                old_drive_items.append({"id": d_id, "kind": kind, "title": "Документ", "src": fr_src})

        # В. З посилань links (наприклад, посилання на завантаження або перегляд)
        for lk in page_scraped.get("links", []):
            href = lk.get("href", "")
            d_id, kind = extract_drive_id(href)
            if d_id and d_id not in seen_drive_ids:
                seen_drive_ids.add(d_id)
                title = clean_title(lk.get("text") or "")
                old_drive_items.append({"id": d_id, "kind": kind, "title": title, "src": href})

        # Тепер перевіряємо, яких документів немає в поточному файлі
        docs_to_add = []
        for item in old_drive_items:
            d_id = item["id"]
            if d_id not in current_md:
                docs_to_add.append(item)

        if docs_to_add:
            # Для кожного відсутнього документа формуємо блок вбудовування
            blocks = []
            for doc in docs_to_add:
                d_id = doc["id"]
                kind = doc["kind"]
                title = doc["title"]
                
                # Перевіримо, чи в тексті вже є назва файлу (наприклад "Статут (1).pdf")
                # Якщо назва файлу стоїть як окремий рядок, замінимо її на робочий блок
                filename_pattern = re.compile(rf"(^|\n)({re.escape(title)})(\n|$)", re.IGNORECASE)
                
                if kind in ("document", "spreadsheets", "presentation"):
                    tail = "embed" if kind == "presentation" else "preview"
                    embed_code = (
                        f'<iframe src="https://docs.google.com/{kind}/d/{d_id}/{tail}" '
                        f'title="{title}"></iframe>\n\n'
                        f'[Відкрити {title}](https://docs.google.com/{kind}/d/{d_id}/view)'
                    )
                else:
                    embed_code = (
                        f'<iframe src="https://drive.google.com/file/d/{d_id}/preview" '
                        f'title="{title}"></iframe>\n\n'
                        f'[Завантажити файл: {title}](https://drive.google.com/uc?export=download&id={d_id})'
                    )

                if title and len(title) > 3 and title.lower() != "документ" and filename_pattern.search(current_md):
                    # Замінюємо рядок-заглушку на повноцінний блок
                    current_md = filename_pattern.sub(rf"\1{embed_code}\3", current_md, count=1)
                    file_changed = True
                    restored_stats["drive_docs"] += 1
                else:
                    # Додаємо блок наприкінці сторінки або під відповідним розділом
                    blocks.append(f"### {title}\n\n{embed_code}" if title != "Документ" else embed_code)
                    restored_stats["drive_docs"] += 1

            if blocks:
                current_md = current_md.strip() + "\n\n" + "\n\n".join(blocks) + "\n"
                file_changed = True

            print(f"   [+] {slug}: відновлено {len(docs_to_add)} Drive/Docs документів")

        # ---------------- 3. ВІДНОВЛЕННЯ ЦІЛЬОВИХ URL КЛІКАБЕЛЬНИХ ЗОБРАЖЕНЬ ----------------
        # Перевіряємо зображення, які на старому сайті були посиланнями
        old_clickable_images = [img for img in page_scraped.get("images", []) if img.get("isClickable") and img.get("parentHref")]
        
        for cimg in old_clickable_images:
            target_href = unwrap_google(cimg["parentHref"])
            if not target_href or target_href == "#":
                continue
            
            # Якщо посилання веде на старий сайт, нормалізуємо у внутрішнє #/slug
            if "sites.google.com/view/dmlsayt" in target_href:
                for s_slug, s_path in source_map.items():
                    if s_path in urllib.parse.unquote(target_href):
                        target_href = f"#/{s_slug}"
                        break

            # Шукаємо в Markdown картинку, яка зараз НЕ є посиланням
            # Звичайна картинка: ![alt](src), перед якою немає [ і після якої немає ](url)
            # Шукаємо всі ![alt](src)
            img_matches = list(re.finditer(r"!\[(.*?)\]\((.*?)\)", current_md))
            for match in img_matches:
                start = match.start()
                end = match.end()
                img_alt = match.group(1)
                img_src = match.group(2)

                # Перевіримо, чи це зображення вже огорнуто в посилання
                is_wrapped = False
                if start > 0 and current_md[start - 1] == "[" and end < len(current_md) and current_md[end] == "]":
                    is_wrapped = True

                if not is_wrapped and target_href not in current_md:
                    # Огортаємо зображення в посилання
                    old_sub = current_md[start:end]
                    new_sub = f"[{old_sub}]({target_href})"
                    current_md = current_md[:start] + new_sub + current_md[end:]
                    file_changed = True
                    restored_stats["clickable_images"] += 1
                    print(f"   [+] {slug}: відновлено посилання для зображення -> {target_href}")
                    break

        # ---------------- 4. ВІДНОВЛЕННЯ ПРОПУЩЕНИХ YOUTUBE ВІДЕО ----------------
        old_yt_items = page_scraped.get("frameArtifacts", {}).get("youtube_embeds", [])
        for yte in old_yt_items:
            yt_m = re.search(r"([A-Za-z0-9_-]{11})", yte)
            if yt_m:
                ytid = yt_m.group(1)
                if ytid not in current_md:
                    yt_block = f'<iframe src="https://www.youtube-nocookie.com/embed/{ytid}" title="Відео" allowfullscreen></iframe>\n\n'
                    current_md = current_md.strip() + "\n\n" + yt_block
                    file_changed = True
                    restored_stats["embeds"] += 1
                    print(f"   [+] {slug}: відновлено YouTube відео {ytid}")

        # Зберігаємо файл у разі змін
        if file_changed:
            with open(local_file, "w", encoding="utf-8") as f:
                f.write(current_md)
            modified_files.append(slug)

    print(f"\n[3/5] Завершено відновлення.")
    print(f"      Модифіковано файлів: {len(modified_files)}")
    print(f"      Відновлено форм: {restored_stats['forms']}")
    print(f"      Відновлено Drive/Docs документів: {restored_stats['drive_docs']}")
    print(f"      Відновлено клікабельних зображень: {restored_stats['clickable_images']}")
    print(f"      Відновлено YouTube/embeds: {restored_stats['embeds']}")
    return modified_files, restored_stats


def run_post_repair_audit():
    print("\n[4/5] Запуск повторного аудиту для верифікації...")
    # Використовуємо існуючий tools/audit/full_audit.py або локальну перевірку
    audit_script = os.path.join(ROOT_DIR, "tools", "audit", "full_audit.py")
    
    # Викликаємо full_audit
    import subprocess
    cmd = [sys.executable, audit_script]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    print(proc.stdout)
    if proc.stderr:
        print("Помилки під час аудиту:", proc.stderr)


def generate_final_summary(modified_files, restored_stats):
    print("\n[5/5] Формування фінального підсумку ЕТАПУ 2...")
    
    # Зчитуємо новий аудит
    results_path = os.path.join(AUDIT_DIR, "audit_results.json")
    if os.path.exists(results_path):
        with open(results_path, "r", encoding="utf-8") as f:
            new_audit = json.load(f)
    else:
        new_audit = []

    total_pages = len(new_audit)
    ok_pages = sum(1 for r in new_audit if r.get("status") == "OK")
    problem_pages = sum(1 for r in new_audit if r.get("status") != "OK")

    # Згрупуємо залишок проблем
    remaining_counts = {}
    for r in new_audit:
        for pr in r.get("problems", []):
            t = pr.get("type", "OTHER")
            remaining_counts[t] = remaining_counts.get(t, 0) + 1

    summary_lines = [
        "# ПІДСУМКОВИЙ ЗВІТ ЕТАПУ 2 (ВІДНОВЛЕННЯ КОНТЕНТУ)",
        f"\n**Дата завершення**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "\n## СТАТИСТИКА ВІДНОВЛЕННЯ:",
        f"- Перевірено сторінок: {total_pages}",
        f"- Модифіковано файлів: {len(modified_files)}",
        f"- Відновлено форм (FormDesigner): {restored_stats['forms']}",
        f"- Відновлено Google Drive / Docs документів та посилань: {restored_stats['drive_docs']}",
        f"- Відновлено клікабельних зображень: {restored_stats['clickable_images']}",
        f"- Відновлено YouTube/embeds: {restored_stats['embeds']}",
        "\n## РЕЗУЛЬТАТИ ПОВТОРНОГО АУДИТУ ПІСЛЯ ВІДНОВЛЕННЯ:",
        f"- TOTAL PAGES: {total_pages}",
        f"- OK PAGES: {ok_pages}",
        f"- PAGES WITH REMAINING ITEMS: {problem_pages}",
        "\n### Залишок елементів за категоріями:"
    ]
    for k, v in sorted(remaining_counts.items()):
        summary_lines.append(f"- {k}: {v}")

    summary_lines.append("\n## СПИСОК ЗМІНЕНИХ ФАЙЛІВ:")
    for f in sorted(modified_files):
        summary_lines.append(f"- content/pages/{f}.md")

    summary_lines.append("\n> [!NOTE]\n> Резервна копія до початку відновлення збережена у: content/pages_backup_before_stage2/")
    summary_lines.append("> Жодних git commit та git push не виконувалось.")

    summary_file = os.path.join(REPAIR_DIR, "repair_summary.md")
    with open(summary_file, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines))

    print("=" * 70)
    print("\n".join(summary_lines))
    print("=" * 70)


def main():
    print("=" * 70)
    print("СТАРТ ЕТАПУ 2: БЕЗПЕЧНЕ ВІДНОВЛЕННЯ ВТРАЧЕНОГО КОНТЕНТУ")
    print("=" * 70)
    backup_pages()
    modified_files, restored_stats = restore_content()
    run_post_repair_audit()
    generate_final_summary(modified_files, restored_stats)


if __name__ == "__main__":
    main()
