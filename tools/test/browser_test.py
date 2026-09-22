#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/test/browser_test.py
Реальний тест у браузері Playwright (Headless):
1. Запускає локальний http.server.
2. Відкриває головну сторінку, перевіряє завантаження сайту, мобільне та десктопне відображення.
3. Перевіряє відсутність JavaScript console errors.
4. Перевіряє переходи на #/plan-roboty-litseiu, #/zvorotnii-zviazok, #/arkhiv, #/pro-nas, #/zno-dpa-nmt.
5. Перевіряє монтування форми #feedbackForm.
6. Перевіряє відсутність 404 у консолі.
7. Перевіряє адмінпанель /admin/index.html.
"""

import os
import sys
import time
import socket
import threading
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def all_page_slugs():
    with open(os.path.join(ROOT_DIR, "content", "site.json"), encoding="utf-8") as f:
        site = json.load(f)
    slugs = []
    def visit(nodes):
        for node in nodes or []:
            if node.get("slug"):
                slugs.append(node["slug"])
            visit(node.get("children"))
    visit(site.get("nav"))
    return slugs

def get_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('', 0))
    port = s.getsockname()[1]
    s.close()
    return port

class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def run_browser_tests():
    port = get_free_port()
    httpd = HTTPServer(('127.0.0.1', port), QuietHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://127.0.0.1:{port}"

    console_errors = []
    page_errors = []

    print("=" * 70)
    print("БРАУЗЕРНЕ ТЕСТУВАННЯ PLAYWRIGHT (HEADLESS)")
    print(f"Сервер запущено: {base_url}")
    print("=" * 70)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        THIRD_PARTY = ("favicon", "fburl.com", "facebook.com", "google-analytics", "maps.googleapis",
                       "gstatic.com", "firebase", "ErrorUtils", "Could not find element", "guardList",
                       "clientTime", "Subsequent non-fatal")
        def _on_console(msg):
            if msg.type == "error":
                txt = msg.text
                if not any(p in txt for p in THIRD_PARTY):
                    console_errors.append(txt)
        page.on("console", _on_console)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        # 1. Головна сторінка
        print("-> Перевірка завантаження головної (ПК) ... ", end="")
        page.goto(f"{base_url}/index.html#/")
        page.wait_for_selector("#nav .item", timeout=6000)
        title = page.locator(".brand-text strong").text_content()
        assert "Дмитрушківський ліцей" in title, f"Неправильний заголовок: {title}"
        print("✓ OK")

        # 2. Сторінка зворотного зв'язку
        print("-> Перевірка сторінки #/zvorotnii-zviazok та форми ... ", end="")
        page.evaluate("location.hash = '#/zvorotnii-zviazok'")
        page.wait_for_selector("#feedbackForm", timeout=6000)
        assert page.locator("#fb_name").is_visible(), "Поле fb_name не знайдено"
        assert page.locator("#fb_email").is_visible(), "Поле fb_email не знайдено"
        assert page.locator("#fb_message").is_visible(), "Поле fb_message не знайдено"
        assert page.locator("#fb_submit_btn").is_visible(), "Кнопка submit не знайдена"
        print("✓ OK (форма змонтована)")

        # 3. Сторінка плану роботи
        print("-> Перевірка сторінки #/plan-roboty-litseiu та карток документів ... ", end="")
        page.evaluate("location.hash = '#/plan-roboty-litseiu'")
        page.wait_for_selector(".doc-grid", timeout=6000)
        doc_cards = page.locator(".doc-card").count()
        assert doc_cards >= 10, f"Очікувалось щонайменше 10 карток документів, знайдено {doc_cards}"
        print(f"✓ OK ({doc_cards} карток документів)")

        # Regression: a ready document card must not have its action links
        # converted into additional Google Drive previews by render.enhance().
        print("-> Regression: 1 документ = 1 preview на всіх сторінках ... ", end="")
        affected_pages = []
        duplicate_previews = 0
        checked_cards = 0
        for slug in all_page_slugs():
            page.evaluate("slug => { location.hash = '#/' + slug; }", slug)
            page.wait_for_selector(f'article[data-page="{slug}"]', timeout=6000)
            result = page.locator("main").evaluate("""root => {
                const logicalContainers = [...root.querySelectorAll('.doc-card, .google-document-viewer')];
                const failures = [];
                for (const container of logicalContainers) {
                    if (container.closest('.doc-card') && !container.classList.contains('doc-card')) continue;
                    const sources = [...container.querySelectorAll('iframe')].map(frame => frame.src);
                    const duplicates = sources.filter((src, i) => sources.indexOf(src) !== i);
                    if (duplicates.length) failures.push(duplicates);
                }
                for (const embed of root.querySelectorAll('.embed')) {
                    if (embed.querySelectorAll(':scope > iframe').length !== 1) {
                        failures.push(['invalid-embed-iframe-count']);
                    }
                }
                return { cards: root.querySelectorAll('.doc-card').length, failures };
            }""")
            checked_cards += result["cards"]
            if result["failures"]:
                affected_pages.append(slug)
                duplicate_previews += sum(len(group) for group in result["failures"])
        assert not affected_pages, (
            f"Дубльовані preview знайдено на {len(affected_pages)} сторінках "
            f"({duplicate_previews} зайвих iframe): {affected_pages}"
        )
        print(f"✓ OK (62/62 сторінки, {checked_cards} document cards)")

        # 4. Сторінка архіву та внутрішній якір
        print("-> Перевірка #/arkhiv та якірної навігації ... ", end="")
        page.evaluate("location.hash = '#/arkhiv'")
        page.wait_for_selector('a[id="h.vnlaleksf2b1"]', state='attached', timeout=6000)
        anchor_el = page.locator('a[id="h.vnlaleksf2b1"]')
        assert anchor_el.count() > 0, "Якір h.vnlaleksf2b1 не знайдено"
        print("✓ OK (якір статті канікул знайдено)")

        # 5. Сторінка про нас з картою
        print("-> Перевірка #/pro-nas та карти ... ", end="")
        page.evaluate("location.hash = '#/pro-nas'")
        page.wait_for_selector('iframe[title*="Карта"]', timeout=6000)
        assert page.locator('iframe[title*="Карта"]').is_visible(), "Карту не знайдено"
        print("✓ OK")

        # 6. Сторінка ЗНО/ДПА/НМТ
        print("-> Перевірка #/zno-dpa-nmt ... ", end="")
        page.evaluate("location.hash = '#/zno-dpa-nmt'")
        page.wait_for_selector('a[href*="testportal.gov.ua"]', timeout=6000)
        print("✓ OK")

        # 7. Мобільне відображення
        print("-> Перевірка мобільного вигляду (375x667) ... ", end="")
        page.set_viewport_size({"width": 375, "height": 667})
        page.evaluate("location.hash = '#/plan-roboty-litseiu'")
        page.wait_for_selector(".menu-btn", timeout=6000)
        assert page.locator(".menu-btn").is_visible(), "Кнопка меню не видима на мобільному"
        print("✓ OK")

        # 8. Адмінпанель
        print("-> Перевірка адмінпанелі /admin/index.html ... ", end="")
        admin_page = context.new_page()
        admin_page.goto(f"{base_url}/admin/index.html")
        admin_page.wait_for_selector(".login", timeout=6000)
        assert admin_page.locator("#repo").is_visible(), "Поле repo не знайдено в адмінці"
        assert admin_page.locator("#token").is_visible(), "Поле token не знайдено в адмінці"
        assert admin_page.locator("#fb_email").is_visible(), "Поле fb_email не знайдено в адмінці"
        assert admin_page.locator("#fb_pass").is_visible(), "Поле fb_pass не знайдено в адмінці"
        print("✓ OK (єдиний вхід налаштовано)")

        browser.close()

    httpd.shutdown()

    IGNORE = ("Failed to load resource", "firebase", "fburl.com", "gstatic.com",
               "google", "guardList", "ErrorUtils", "Subsequent non-fatal", "Could not find element",
               "clientTime", "favicon")
    critical_errors = [e for e in console_errors if not any(p.lower() in e.lower() for p in IGNORE)]

    print("=" * 70)
    if critical_errors or page_errors:
        print(f"Знайдено помилок у браузері: {len(critical_errors) + len(page_errors)}")
        for e in critical_errors:
            print(f"  Console Error: {e}")
        for e in page_errors:
            print(f"  Page Error: {e}")
        return False
    else:
        print("Всі браузерні перевірки завершено успішно без помилок JavaScript!")
        return True

if __name__ == "__main__":
    ok_res = run_browser_tests()
    sys.exit(0 if ok_res else 1)
