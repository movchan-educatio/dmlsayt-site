#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Повний READ-ONLY аудит міграції Google Sites -> dmlsayt-site.
НЕ вносить жодних змін до content/pages, site.json чи uploads.
Запускає Playwright, зчитує відрендерений DOM кожної сторінки,
порівнює з локальними Markdown-файлами та генерує вичерпний звіт.
"""

import os
import sys
import json
import re
import time
import urllib.parse
from datetime import datetime

# Гарантуємо UTF-8 для виводу в консоль Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AUDIT_DIR = os.path.join(ROOT_DIR, "tools", "audit")
SOURCE_MAP_PATH = os.path.join(ROOT_DIR, "tools", "source_map.json")
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
SITE_JSON_PATH = os.path.join(ROOT_DIR, "content", "site.json")
BASE_URL = "https://sites.google.com/view/dmlsayt"

os.makedirs(AUDIT_DIR, exist_ok=True)


def unwrap_google(url):
    """Розгортає редиректи Google https://www.google.com/url?q=... -> прямий URL."""
    if not url:
        return ""
    url = url.strip()
    p = urllib.parse.urlparse(url)
    if (p.netloc.endswith("google.com") or p.netloc == "google.com") and p.path == "/url":
        qs = urllib.parse.parse_qs(p.query)
        if "q" in qs and qs["q"]:
            return qs["q"][0]
    return url


def normalize_drive_id(url):
    """Витягує ID файлу Google Drive або документа Google Docs."""
    if not url:
        return None
    url = unwrap_google(url)
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?id=|uc\?export=download&id=)([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(1)
    m = re.search(r"docs\.google\.com/(?:document|spreadsheets|presentation|forms)/d/([A-Za-z0-9_-]{20,})", url)
    if m:
        return m.group(1)
    return None


def normalize_url(url):
    """Нормалізує URL для порівняння."""
    if not url:
        return ""
    url = unwrap_google(url).strip()
    url = url.rstrip("/")
    return url


def clean_text_for_compare(text):
    """Очищає текст для порівняння вмісту."""
    if not text:
        return ""
    t = text.replace("\xa0", " ").replace("\u200b", " ")
    t = re.sub(r"\s+", " ", t)
    return t.strip().lower()


def parse_markdown_page(file_path):
    """
    Парсить локальний Markdown файл:
    - витягує всі зображення (з alt, src)
    - витягує клікабельні зображення [![alt](img)](url)
    - витягує звичайні посилання [text](url)
    - витягує iframe (<iframe src="...">)
    - витягує чистий текст
    """
    if not os.path.exists(file_path):
        return None

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    data = {
        "raw": content,
        "images": [],           # list of {"alt": ..., "src": ...}
        "clickable_images": [], # list of {"alt": ..., "src": ..., "href": ...}
        "links": [],            # list of {"text": ..., "href": ...}
        "iframes": [],          # list of {"src": ..., "title": ...}
        "drive_ids": set(),
        "youtube_ids": set(),
        "forms": [],
        "text": ""
    }

    # 1. Шукаємо клікабельні зображення: [!\[alt\](src)](href) або [text!\[alt\](src)text](href)
    clickable_img_pattern = re.compile(r"\[(?:[^\]]*?)!\[(.*?)\]\((.*?)\)(?:[^\]]*?)\]\((.*?)\)")
    for match in clickable_img_pattern.finditer(content):
        alt = match.group(1).strip()
        src = match.group(2).strip()
        href = match.group(3).strip()
        data["clickable_images"].append({"alt": alt, "src": src, "href": href})
        drive_id = normalize_drive_id(href)
        if drive_id:
            data["drive_ids"].add(drive_id)

    # 2. Шукаємо всі зображення ![alt](src)
    img_pattern = re.compile(r"!\[(.*?)\]\((.*?)\)")
    for match in img_pattern.finditer(content):
        alt = match.group(1).strip()
        src = match.group(2).strip()
        data["images"].append({"alt": alt, "src": src})

    # 3. Шукаємо iframes: <iframe ... src="(.*?)" ...>
    iframe_pattern = re.compile(r"<iframe\s+([^>]*?)>", re.IGNORECASE)
    for match in iframe_pattern.finditer(content):
        attrs_str = match.group(1)
        src_m = re.search(r'src=["\'](.*?)["\']', attrs_str, re.IGNORECASE)
        title_m = re.search(r'title=["\'](.*?)["\']', attrs_str, re.IGNORECASE)
        src = src_m.group(1) if src_m else ""
        title = title_m.group(1) if title_m else ""
        data["iframes"].append({"src": src, "title": title})
        
        drive_id = normalize_drive_id(src)
        if drive_id:
            data["drive_ids"].add(drive_id)
            
        yt_m = re.search(r"youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{11})", src)
        if yt_m:
            data["youtube_ids"].add(yt_m.group(1))
            
        if "formdesigner" in src or "docs.google.com/forms" in src:
            data["forms"].append(src)

    # 4. Шукаємо звичайні текстові посилання [text](href), не є зображеннями
    # Тимчасово прибираємо зображення
    temp_content = clickable_img_pattern.sub(" ", content)
    temp_content = img_pattern.sub(" ", temp_content)
    temp_content = iframe_pattern.sub(" ", temp_content)

    link_pattern = re.compile(r"\[(.*?)\]\((.*?)\)")
    for match in link_pattern.finditer(temp_content):
        text = match.group(1).strip()
        href = match.group(2).strip()
        data["links"].append({"text": text, "href": href})
        drive_id = normalize_drive_id(href)
        if drive_id:
            data["drive_ids"].add(drive_id)
        if "formdesigner" in href or "docs.google.com/forms" in href:
            data["forms"].append(href)

    # 5. Очищений текст
    # Видаляємо розмітку посилань
    plain_text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", temp_content)
    plain_text = re.sub(r"[#*`_>|~-]", " ", plain_text)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()
    data["text"] = plain_text

    return data


def scrape_old_page_dom(page, url):
    """
    Витягує структуровані дані безпосередньо з відрендереного DOM Google Sites.
    """
    page.goto(url, wait_until="load", timeout=45000)
    page.wait_for_timeout(2500)

    # Витягуємо дані головного фрейму
    dom_data = page.evaluate("""() => {
        // Допоміжна функція очищення
        const unwrap = (u) => {
            if (!u) return '';
            if (u.includes('google.com/url?')) {
                try {
                    const parsed = new URL(u);
                    const q = parsed.searchParams.get('q');
                    if (q) return q;
                } catch(e) {}
            }
            return u;
        };

        // Знаходимо всі секції, окрім шапки та підвалу
        const allSections = Array.from(document.querySelectorAll('section'));
        const contentSections = allSections.filter(s => {
            // відсікаємо footer
            if (s.closest('footer')) return false;
            // відсікаємо навігацію / шапку
            if (s.closest('header, nav, [role="banner"], [role="navigation"]')) return false;
            const t = (s.innerText || '').trim();
            if (t.startsWith('©') || t.startsWith('🗺')) return false;
            return true;
        });

        // Якщо секцій немає, беремо main або body
        const container = contentSections.length > 0 ? contentSections : [document.querySelector('main') || document.body];

        // 1. Збираємо всі посилання
        const links = [];
        const seenLinks = new Set();
        container.forEach(root => {
            root.querySelectorAll('a[href]').forEach(a => {
                if (a.closest('header, nav, footer, [role="banner"], [role="navigation"]')) return;
                const href = unwrap(a.href);
                const text = (a.innerText || '').trim();
                const img = a.querySelector('img');
                const key = href + '::' + text + '::' + (img ? 'img' : 'txt');
                if (seenLinks.has(key)) return;
                seenLinks.add(key);

                links.push({
                    href: href,
                    text: text,
                    isClickableImage: !!img,
                    imgSrc: img ? img.src : null,
                    imgAlt: img ? (img.alt || '') : null
                });
            });
        });

        // 2. Збираємо всі зображення
        const images = [];
        const seenImages = new Set();
        container.forEach(root => {
            root.querySelectorAll('img').forEach(img => {
                if (img.closest('header, nav, footer, [role="banner"], [role="navigation"]')) return;
                // ігноруємо службові іконки Google
                if (img.src && (img.src.includes('cleardot.gif') || img.src.includes('google.com/images/branding/'))) return;
                
                const parentA = img.closest('a');
                const parentHref = parentA ? unwrap(parentA.href) : null;
                const key = img.src + '::' + (parentHref || '');
                if (seenImages.has(key)) return;
                seenImages.add(key);

                images.push({
                    src: img.src,
                    alt: (img.alt || '').trim(),
                    isClickable: !!parentA,
                    parentHref: parentHref,
                    naturalWidth: img.naturalWidth || 0,
                    naturalHeight: img.naturalHeight || 0
                });
            });
        });

        // 3. Збираємо всі iframe з DOM
        const iframes = [];
        container.forEach(root => {
            root.querySelectorAll('iframe').forEach(f => {
                if (f.closest('header, nav, footer, [role="banner"], [role="navigation"]')) return;
                iframes.push({
                    src: f.src || '',
                    title: f.title || '',
                    ariaLabel: f.getAttribute('aria-label') || '',
                    dataCode: f.getAttribute('data-code') || ''
                });
            });
        });

        // 4. Заголовки (h1-h6)
        const headings = [];
        container.forEach(root => {
            root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]').forEach(h => {
                const ht = (h.innerText || '').trim();
                if (ht && !headings.includes(ht)) {
                    headings.push(ht);
                }
            });
        });

        // 5. Таблиці
        const tablesCount = container.reduce((acc, root) => acc + root.querySelectorAll('table').length, 0);

        // 6. Списки
        const listsCount = container.reduce((acc, root) => acc + root.querySelectorAll('ul, ol').length, 0);

        // 7. Повний текст
        let fullText = '';
        container.forEach(root => {
            const clone = root.cloneNode(true);
            clone.querySelectorAll('header, nav, footer, script, style, [role="banner"], [role="navigation"]').forEach(el => el.remove());
            fullText += ' ' + (clone.innerText || '');
        });

        return {
            pageTitle: document.title,
            headings: headings,
            links: links,
            images: images,
            iframes: iframes,
            tablesCount: tablesCount,
            listsCount: listsCount,
            text: fullText.replace(/\\s+/g, ' ').trim()
        };
    }""")

    # Тепер досліджуємо всі вкладені frames (page.frames)
    # Це критично для форм (formdesigner тощо), Google Drive вбудувань та кастомних віджетів!
    frame_artifacts = {
        "forms": [],
        "drive_embeds": [],
        "youtube_embeds": [],
        "custom_embed_urls": []
    }

    for fr in page.frames:
        if fr == page.main_frame:
            continue
        fr_url = fr.url
        if not fr_url or fr_url == "about:blank":
            # Перевіримо вміст about:blank фрейму
            try:
                sub_iframes = fr.evaluate("() => Array.from(document.querySelectorAll('iframe')).map(i => i.src)")
                for sub_src in sub_iframes:
                    if sub_src:
                        if "formdesigner" in sub_src or "forms" in sub_src:
                            frame_artifacts["forms"].append(sub_src)
                        elif "drive.google.com" in sub_src:
                            frame_artifacts["drive_embeds"].append(sub_src)
                        elif "youtube" in sub_src:
                            frame_artifacts["youtube_embeds"].append(sub_src)
                        else:
                            frame_artifacts["custom_embed_urls"].append(sub_src)
            except Exception:
                pass
            continue

        if "formdesigner" in fr_url or "docs.google.com/forms" in fr_url:
            frame_artifacts["forms"].append(fr_url)
        elif "drive.google.com" in fr_url:
            frame_artifacts["drive_embeds"].append(fr_url)
        elif "youtube.com" in fr_url or "youtu.be" in fr_url:
            frame_artifacts["youtube_embeds"].append(fr_url)
        elif not fr_url.startswith("https://www.gstatic.com") and not "googleusercontent.com" in fr_url:
            frame_artifacts["custom_embed_urls"].append(fr_url)

        # Перевіримо наявність <form> всередині фрейму
        try:
            form_actions = fr.evaluate("() => Array.from(document.querySelectorAll('form')).map(f => f.action)")
            for fa in form_actions:
                if fa and fa not in frame_artifacts["forms"]:
                    frame_artifacts["forms"].append(fa)
        except Exception:
            pass

    dom_data["frameArtifacts"] = frame_artifacts
    return dom_data


def classify_link(href):
    """Класифікує посилання за типами."""
    h = unwrap_google(href).lower()
    if not h:
        return "empty"
    if h.startswith("mailto:"):
        return "mailto"
    if h.startswith("tel:"):
        return "tel"
    if "drive.google.com" in h:
        return "drive"
    if "docs.google.com" in h:
        if "/forms/" in h:
            return "google_form"
        if "/spreadsheets/" in h:
            return "google_sheet"
        if "/presentation/" in h:
            return "google_slide"
        if "/document/" in h:
            return "google_doc"
        return "google_docs"
    if "formdesigner" in h:
        return "custom_form"
    if "youtube.com" in h or "youtu.be" in h:
        return "youtube"
    if "facebook.com" in h or "fb.com" in h:
        return "facebook"
    if "t.me" in h or "telegram.me" in h:
        return "telegram"
    if any(soc in h for soc in ["instagram.com", "twitter.com", "x.com", "viber.com", "tiktok.com"]):
        return "social"
    if any(h.endswith(ext) or ext + "?" in h for ext in [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar"]):
        return "document"
    if "sites.google.com/view/dmlsayt" in h:
        return "internal"
    return "external"


def run_audit():
    print("=" * 70)
    print("РОЗПОЧАТО АВТОМАТИЧНИЙ DRY-RUN АУДИТ МІГРАЦІЇ GOOGLE SITES")
    print(f"Час запуску: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # 1. Завантажуємо карту джерел source_map.json
    if not os.path.exists(SOURCE_MAP_PATH):
        sys.exit(f"Помилка: не знайдено {SOURCE_MAP_PATH}")

    with open(SOURCE_MAP_PATH, "r", encoding="utf-8") as f:
        source_map = json.load(f)

    print(f"Завантажено {len(source_map)} сторінок із source_map.json")

    # 2. Перевіряємо наявність локальних файлів
    local_files = {}
    for slug in source_map.keys():
        fpath = os.path.join(PAGES_DIR, f"{slug}.md")
        if os.path.exists(fpath):
            local_files[slug] = fpath
        else:
            local_files[slug] = None

    print(f"Знайдено відповідних локальних Markdown-файлів: {sum(1 for v in local_files.values() if v is not None)} з {len(source_map)}")

    # 3. Запускаємо Playwright
    from playwright.sync_api import sync_playwright

    scraped_data = {}
    audit_results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        total_pages = len(source_map)
        idx = 0

        for slug, gs_path in source_map.items():
            idx += 1
            url = f"{BASE_URL}/{urllib.parse.quote(gs_path)}"
            local_file = local_files.get(slug)
            print(f"[{idx}/{total_pages}] Сканування: {slug} ({gs_path[:40]}...)")

            try:
                dom = scrape_old_page_dom(page, url)
                scraped_data[slug] = dom
            except Exception as e:
                print(f"   [ПОМИЛКА СКАНУВАННЯ] {slug}: {e}")
                scraped_data[slug] = {"error": str(e)}
                audit_results.append({
                    "slug": slug,
                    "gs_path": gs_path,
                    "url": url,
                    "local_file": local_file,
                    "status": "ERROR",
                    "problems": [{
                        "type": "CRAWL_ERROR",
                        "problem": f"Не вдалося відкрити сторінку: {e}",
                        "old_value": url,
                        "current_value": "None",
                        "safe_fix": "Повторити спробу сканування або перевірити доступ",
                        "confidence": "HIGH"
                    }]
                })
                continue

            # Парсимо локальний файл
            parsed_md = parse_markdown_page(local_file) if local_file else None

            # Зіставляємо дані та формуємо проблеми
            page_problems = []

            if parsed_md is None:
                page_problems.append({
                    "type": "MISSING_LOCAL_FILE",
                    "problem": f"Локальний файл content/pages/{slug}.md відсутній",
                    "old_value": url,
                    "current_value": "Файл відсутній",
                    "safe_fix": f"Створити content/pages/{slug}.md",
                    "confidence": "HIGH"
                })
                audit_results.append({
                    "slug": slug,
                    "gs_path": gs_path,
                    "url": url,
                    "local_file": local_file,
                    "status": "ERROR",
                    "problems": page_problems
                })
                continue

            # ---------------- АНАЛІЗ ПРОБЛЕМ ----------------
            
            # А. ЗВОРОТНІЙ ЗВ'ЯЗОК / ФОРМИ (КРИТИЧНО)
            old_forms = dom["frameArtifacts"]["forms"]
            # Також шукаємо форми в iframes / data-code
            for ifr in dom["iframes"]:
                if "forms" in ifr["src"] or "formdesigner" in ifr["src"]:
                    if ifr["src"] not in old_forms:
                        old_forms.append(ifr["src"])

            if old_forms:
                for of in old_forms:
                    # Чи є вона в локальному md?
                    matched = any(normalize_url(of) in normalize_url(nf) or (normalize_drive_id(of) and normalize_drive_id(of) == normalize_drive_id(nf)) for nf in parsed_md["forms"] + [ifr["src"] for ifr in parsed_md["iframes"]])
                    if not matched:
                        page_problems.append({
                            "type": "LOST_GOOGLE_FORMS",
                            "problem": f"Втрачено інтерактивну форму зворотного зв'язку / форми",
                            "old_value": of,
                            "current_value": "Відсутня у файлі",
                            "safe_fix": f'<iframe src="{of}" style="width:100%;height:650px;border:none;" title="Форма"></iframe>',
                            "confidence": "HIGH"
                        })

            # Б. КЛІКАБЕЛЬНІ ЗОБРАЖЕННЯ (КРИТИЧНО)
            # На старому сайті: картинка всередині <a> з href
            old_clickable_images = [img for img in dom["images"] if img["isClickable"] and img["parentHref"]]
            
            for old_cimg in old_clickable_images:
                href = unwrap_google(old_cimg["parentHref"])
                href_norm = normalize_url(href)
                c_type = classify_link(href)
                
                # Перевіримо, чи є ця адреса серед клікабельних зображень у Markdown
                found_in_md_clickable = False
                for new_cimg in parsed_md["clickable_images"]:
                    new_href_norm = normalize_url(new_cimg["href"])
                    if href_norm == new_href_norm or (normalize_drive_id(href) and normalize_drive_id(href) in new_href_norm):
                        found_in_md_clickable = True
                        break
                    # Також внутрішнє посилання може бути конвертоване у #/slug
                    if "#/" in new_href_norm and slug in new_href_norm:
                        found_in_md_clickable = True
                        break

                if not found_in_md_clickable:
                    # Чи присутня картинка, але втратила клікабельність?
                    has_images_in_md = len(parsed_md["images"]) > 0
                    problem_cat = "LOST_CLICKABLE_IMAGE"
                    if c_type in ("drive", "google_doc", "google_sheet", "google_slide"):
                        problem_cat = "LOST_DRIVE/DOCS_LINKS"
                    elif c_type in ("facebook", "telegram", "social"):
                        problem_cat = "LOST_SOCIAL_LINKS"
                    elif c_type == "document":
                        problem_cat = "MISSING_DOCUMENTS"

                    page_problems.append({
                        "type": problem_cat,
                        "problem": f"Клікабельне зображення втратило посилання (стало звичайною картинкою або відсутнє)",
                        "old_value": f"Зображення -> {href}",
                        "current_value": "Зображення без посилання" if has_images_in_md else "Зображення відсутнє",
                        "safe_fix": f"Огорнути зображення в посилання: [![{old_cimg['alt'] or 'зображення'}](uploads/...)({href})]",
                        "confidence": "HIGH"
                    })

            # В. GOOGLE DRIVE / DOCS / EMBEDS В IFRAME
            old_drive_embeds = dom["frameArtifacts"]["drive_embeds"]
            for ifr in dom["iframes"]:
                if "drive.google.com" in ifr["src"] or "docs.google.com" in ifr["src"]:
                    if ifr["src"] not in old_drive_embeds:
                        old_drive_embeds.append(ifr["src"])

            for ode in old_drive_embeds:
                did = normalize_drive_id(ode)
                if did and did not in parsed_md["drive_ids"]:
                    page_problems.append({
                        "type": "LOST_DRIVE/DOCS_LINKS",
                        "problem": f"Втрачено вбудований документ Google Drive / Docs",
                        "old_value": ode,
                        "current_value": "Відсутній у файлі",
                        "safe_fix": f'<iframe src="https://drive.google.com/file/d/{did}/preview" title="Документ"></iframe>\n\n[Завантажити файл](https://drive.google.com/uc?export=download&id={did})',
                        "confidence": "HIGH"
                    })

            # Г. YOUTUBE EMBEDS
            old_yt = dom["frameArtifacts"]["youtube_embeds"]
            for ifr in dom["iframes"]:
                if "youtube" in ifr["src"]:
                    if ifr["src"] not in old_yt:
                        old_yt.append(ifr["src"])
            for yte in old_yt:
                yt_m = re.search(r"([A-Za-z0-9_-]{11})", yte)
                if yt_m:
                    ytid = yt_m.group(1)
                    if ytid not in parsed_md["youtube_ids"]:
                        page_problems.append({
                            "type": "LOST_IFRAMES/EMBEDS",
                            "problem": f"Втрачено YouTube відео",
                            "old_value": yte,
                            "current_value": "Відсутнє у файлі",
                            "safe_fix": f'<iframe src="https://www.youtube-nocookie.com/embed/{ytid}" title="Відео" allowfullscreen></iframe>',
                            "confidence": "HIGH"
                        })

            # Д. ТЕКСТОВІ ПОСИЛАННЯ ТА ДОКУМЕНТИ
            for old_link in dom["links"]:
                # Якщо це клікабельне зображення, ми його вже обробили вище
                if old_link["isClickableImage"]:
                    continue
                href = unwrap_google(old_link["href"])
                if not href or href == "#":
                    continue
                l_type = classify_link(href)
                
                # Перевіримо, чи присутнє посилання у новому файлі
                matched = False
                did = normalize_drive_id(href)
                if did and did in parsed_md["drive_ids"]:
                    matched = True
                else:
                    norm_h = normalize_url(href)
                    for nl in parsed_md["links"]:
                        norm_nl = normalize_url(nl["href"])
                        if norm_h == norm_nl:
                            matched = True
                            break
                        # якщо внутрішнє переведено у хеш
                        if "#/" in norm_nl:
                            matched = True
                            break

                if not matched:
                    prob_type = "LOST_EXTERNAL_LINKS"
                    if l_type in ("drive", "google_doc", "google_sheet", "google_slide"):
                        prob_type = "LOST_DRIVE/DOCS_LINKS"
                    elif l_type == "document":
                        prob_type = "MISSING_DOCUMENTS"
                    elif l_type in ("facebook", "telegram", "social"):
                        prob_type = "LOST_SOCIAL_LINKS"
                    elif l_type == "internal":
                        prob_type = "LOST_INTERNAL_LINKS"

                    # Якщо посилання є чистою навігацією по старому сайту, ігноруємо
                    if l_type == "internal" and href.rstrip("/") == BASE_URL:
                        continue

                    page_problems.append({
                        "type": prob_type,
                        "problem": f"Втрачено текстове посилання: {old_link['text'] or href}",
                        "old_value": href,
                        "current_value": "Відсутнє у тексті",
                        "safe_fix": f"[{old_link['text'] or 'Посилання'}]({href})",
                        "confidence": "HIGH" if l_type in ("drive", "document", "custom_form") else "MEDIUM"
                    })

            # Е. ЗОБРАЖЕННЯ (КІЛЬКІСТЬ І ВІДСУТНІ КАРТИНКИ)
            old_img_count = len(dom["images"])
            new_img_count = len(parsed_md["images"])
            if old_img_count > 0 and new_img_count == 0:
                page_problems.append({
                    "type": "MISSING_IMAGES",
                    "problem": f"На сторінці було {old_img_count} зображень, а в новому файлі жодного не перенесено",
                    "old_value": f"{old_img_count} зображень",
                    "current_value": "0 зображень",
                    "safe_fix": f"Завантажити та додати зображення у uploads/pages/{slug}/",
                    "confidence": "HIGH"
                })
            elif old_img_count > new_img_count and (old_img_count - new_img_count) >= 2:
                page_problems.append({
                    "type": "MISSING_IMAGES",
                    "problem": f"Неповна кількість зображень: на старому {old_img_count}, на новому {new_img_count}",
                    "old_value": f"{old_img_count} зображень",
                    "current_value": f"{new_img_count} зображень",
                    "safe_fix": f"Перевірити пропущені зображення (різниця: {old_img_count - new_img_count})",
                    "confidence": "MEDIUM"
                })

            # Ж. ТЕКСТ (ЗНАЧНИЙ ВТРАЧЕНИЙ ТЕКСТ)
            old_txt_len = len(clean_text_for_compare(dom["text"]))
            new_txt_len = len(clean_text_for_compare(parsed_md["text"]))

            # Якщо на старому сайті був значний текст (>200 симв), а на новому файл майже порожній (<50 симв)
            if old_txt_len > 200 and new_txt_len < 50 and not parsed_md["drive_ids"]:
                page_problems.append({
                    "type": "MISSING_TEXT",
                    "problem": f"Текст сторінки практично не перенесено: довжина тексту на старому {old_txt_len} симв, на новому {new_txt_len} симв",
                    "old_value": f"{old_txt_len} символів тексту",
                    "current_value": f"{new_txt_len} символів",
                    "safe_fix": "Додати повний текст зі старої сторінки",
                    "confidence": "HIGH"
                })

            status = "PROBLEMS" if len(page_problems) > 0 else "OK"
            audit_results.append({
                "slug": slug,
                "gs_path": gs_path,
                "url": url,
                "local_file": local_file,
                "status": status,
                "problems": page_problems
            })

        browser.close()

    # Зберігаємо сирі дані та результати
    with open(os.path.join(AUDIT_DIR, "scraped_old_pages.json"), "w", encoding="utf-8") as f:
        json.dump(scraped_data, f, ensure_ascii=False, indent=2)

    with open(os.path.join(AUDIT_DIR, "audit_results.json"), "w", encoding="utf-8") as f:
        json.dump(audit_results, f, ensure_ascii=False, indent=2)

    # 4. ФОРМУВАННЯ СТАТИСТИКИ
    total_old = len(audit_results)
    total_matched = sum(1 for r in audit_results if r["local_file"] is not None)
    ok_pages = sum(1 for r in audit_results if r["status"] == "OK")
    pages_with_problems = sum(1 for r in audit_results if r["status"] != "OK")

    counts = {
        "MISSING_TEXT": 0,
        "MISSING_IMAGES": 0,
        "LOST_DRIVE_DOCS_LINKS": 0,
        "LOST_GOOGLE_FORMS": 0,
        "LOST_SOCIAL_LINKS": 0,
        "LOST_EXTERNAL_LINKS": 0,
        "LOST_INTERNAL_LINKS": 0,
        "LOST_IFRAMES_EMBEDS": 0,
        "LOST_CLICKABLE_IMAGES": 0,
        "MISSING_DOCUMENTS": 0,
        "MANUAL_REVIEW": 0
    }

    for r in audit_results:
        for p in r.get("problems", []):
            ptype = p.get("type")
            conf = p.get("confidence")
            if conf == "MANUAL_REVIEW" or conf == "MEDIUM":
                counts["MANUAL_REVIEW"] += 1
            if ptype == "MISSING_TEXT":
                counts["MISSING_TEXT"] += 1
            elif ptype == "MISSING_IMAGES":
                counts["MISSING_IMAGES"] += 1
            elif ptype in ("LOST_DRIVE/DOCS_LINKS", "LOST_DRIVE_DOCS_LINKS"):
                counts["LOST_DRIVE_DOCS_LINKS"] += 1
            elif ptype == "LOST_GOOGLE_FORMS":
                counts["LOST_GOOGLE_FORMS"] += 1
            elif ptype == "LOST_SOCIAL_LINKS":
                counts["LOST_SOCIAL_LINKS"] += 1
            elif ptype == "LOST_EXTERNAL_LINKS":
                counts["LOST_EXTERNAL_LINKS"] += 1
            elif ptype == "LOST_INTERNAL_LINKS":
                counts["LOST_INTERNAL_LINKS"] += 1
            elif ptype in ("LOST_IFRAMES/EMBEDS", "LOST_IFRAMES_EMBEDS"):
                counts["LOST_IFRAMES_EMBEDS"] += 1
            elif ptype == "LOST_CLICKABLE_IMAGES":
                counts["LOST_CLICKABLE_IMAGES"] += 1
            elif ptype == "MISSING_DOCUMENTS":
                counts["MISSING_DOCUMENTS"] += 1

    # Генеруємо звіт у форматі Markdown
    report_md_lines = []
    report_md_lines.append("# АУДИТ МІГРАЦІЇ GOOGLE SITES -> DMLSAYT-SITE\n")
    report_md_lines.append(f"**Дата**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_md_lines.append(f"**Еталон**: {BASE_URL}\n")
    report_md_lines.append("## ПІДСУМОК")
    report_md_lines.append(f"- TOTAL OLD PAGES: {total_old}")
    report_md_lines.append(f"- TOTAL MATCHED PAGES: {total_matched}")
    report_md_lines.append(f"- OK PAGES: {ok_pages}")
    report_md_lines.append(f"- PAGES WITH PROBLEMS: {pages_with_problems}\n")
    report_md_lines.append("## КАТЕГОРІЇ ПРОБЛЕМ")
    report_md_lines.append(f"- MISSING TEXT: {counts['MISSING_TEXT']}")
    report_md_lines.append(f"- MISSING IMAGES: {counts['MISSING_IMAGES']}")
    report_md_lines.append(f"- LOST DRIVE/DOCS LINKS: {counts['LOST_DRIVE_DOCS_LINKS']}")
    report_md_lines.append(f"- LOST GOOGLE FORMS: {counts['LOST_GOOGLE_FORMS']}")
    report_md_lines.append(f"- LOST SOCIAL LINKS: {counts['LOST_SOCIAL_LINKS']}")
    report_md_lines.append(f"- LOST EXTERNAL LINKS: {counts['LOST_EXTERNAL_LINKS']}")
    report_md_lines.append(f"- LOST INTERNAL LINKS: {counts['LOST_INTERNAL_LINKS']}")
    report_md_lines.append(f"- LOST IFRAMES/EMBEDS: {counts['LOST_IFRAMES_EMBEDS']}")
    report_md_lines.append(f"- LOST CLICKABLE IMAGES: {counts['LOST_CLICKABLE_IMAGES']}")
    report_md_lines.append(f"- MISSING DOCUMENTS: {counts['MISSING_DOCUMENTS']}")
    report_md_lines.append(f"- MANUAL REVIEW: {counts['MANUAL_REVIEW']}\n")

    # Спеціальна секція для «Зворотній зв'язок»
    report_md_lines.append("## СПЕЦІАЛЬНИЙ АНАЛІЗ: «Зворотній зв'язок»\n")
    feedback_res = next((r for r in audit_results if r["slug"] == "zvorotnii-zviazok"), None)
    if feedback_res:
        report_md_lines.append(f"**PAGE**: Зворотній зв'язок")
        report_md_lines.append(f"**OLD URL**: {feedback_res['url']}")
        report_md_lines.append(f"**LOCAL FILE**: {feedback_res['local_file']}")
        report_md_lines.append(f"**STATUS**: {feedback_res['status']}")
        for p in feedback_res.get("problems", []):
            report_md_lines.append(f"\n- **PROBLEM**: {p['problem']}")
            report_md_lines.append(f"  - **OLD VALUE**: `{p['old_value']}`")
            report_md_lines.append(f"  - **CURRENT VALUE**: `{p['current_value']}`")
            report_md_lines.append(f"  - **SAFE FIX**: `{p['safe_fix']}`")
            report_md_lines.append(f"  - **CONFIDENCE**: {p['confidence']}")
    report_md_lines.append("\n---\n")

    # Деталізація по кожній сторінці з проблемами
    report_md_lines.append("## ДЕТАЛІЗАЦІЯ ПРОБЛЕМ ПО СТОРІНКАХ\n")
    for r in audit_results:
        if r["status"] == "OK":
            continue
        report_md_lines.append(f"### PAGE: {r['slug']} ({r['gs_path']})")
        report_md_lines.append(f"- **OLD URL**: {r['url']}")
        report_md_lines.append(f"- **LOCAL FILE**: {r['local_file']}")
        for p in r.get("problems", []):
            report_md_lines.append(f"\n  - **PROBLEM**: {p['problem']}")
            report_md_lines.append(f"    - **OLD VALUE**: `{p['old_value']}`")
            report_md_lines.append(f"    - **CURRENT VALUE**: `{p['current_value']}`")
            report_md_lines.append(f"    - **SAFE FIX**: `{p['safe_fix']}`")
            report_md_lines.append(f"    - **CONFIDENCE**: {p['confidence']}")
        report_md_lines.append("")

    report_path = os.path.join(AUDIT_DIR, "audit_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_md_lines))

    # Також виводимо у консоль фінальний структурований звіт
    print("\n" + "=" * 70)
    print("ФІНАЛЬНИЙ ЗВІТ АУДИТУ:")
    print("=" * 70)
    print(f"TOTAL OLD PAGES: {total_old}")
    print(f"TOTAL MATCHED PAGES: {total_matched}")
    print(f"OK PAGES: {ok_pages}")
    print(f"PAGES WITH PROBLEMS: {pages_with_problems}")
    print("")
    print(f"MISSING TEXT: {counts['MISSING_TEXT']}")
    print(f"MISSING IMAGES: {counts['MISSING_IMAGES']}")
    print(f"LOST DRIVE/DOCS LINKS: {counts['LOST_DRIVE_DOCS_LINKS']}")
    print(f"LOST GOOGLE FORMS: {counts['LOST_GOOGLE_FORMS']}")
    print(f"LOST SOCIAL LINKS: {counts['LOST_SOCIAL_LINKS']}")
    print(f"LOST EXTERNAL LINKS: {counts['LOST_EXTERNAL_LINKS']}")
    print(f"LOST INTERNAL LINKS: {counts['LOST_INTERNAL_LINKS']}")
    print(f"LOST IFRAMES/EMBEDS: {counts['LOST_IFRAMES_EMBEDS']}")
    print(f"LOST CLICKABLE IMAGES: {counts['LOST_CLICKABLE_IMAGES']}")
    print(f"MISSING DOCUMENTS: {counts['MISSING_DOCUMENTS']}")
    print(f"MANUAL REVIEW: {counts['MANUAL_REVIEW']}")
    print("=" * 70)
    print(f"Повний звіт збережено у: {report_path}")
    print("=" * 70)


if __name__ == "__main__":
    run_audit()
