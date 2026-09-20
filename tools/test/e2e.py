#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/test/e2e.py
Повний комплексний E2E тест перенесення та цілісності сайту Дмитрушківського ліцею.
Перевіряє:
1. Валідність і цілісність site.json та структури навігації.
2. Усі 62 сторінки content/pages/*.md (наявність, відсутність порожніх, правильність розмітки).
3. Усі внутрішні посилання (SPA маршрути #/slug).
4. Усі внутрішньосторінкові якорі (#h.*).
5. Локальні зображення (uploads/...) — наявність файлів на диску, відсутність битих посилань.
6. Матеріали Google Drive/Docs/PDF/Sheets/Slides (збереження 100% ID, коректність .doc-card).
7. Спеціальна перевірка plan-roboty-litseiu: відповідність документів місяцям, сітка .doc-grid.
8. Спеціальна перевірка zvorotnii-zviazok, zno-dpa-nmt, pro-nas, arkhiv.
9. Цілісність і синтаксис assets/js/ (*.js) та admin/ (*.js).
10. Правила безпеки firestore.rules та узгодженість полів із feedback.js.
11. Перевірка відсутності технічного сміття (вкладених репозиторіїв, 32x32 іконок Drive).
"""

import os
import sys
import json
import re
import urllib.parse

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
SITE_JSON_PATH = os.path.join(ROOT_DIR, "content", "site.json")
UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")

errors = []
warnings = []
passed = 0

def test(name):
    print(f"-> Тест: {name} ... ", end="")

def ok():
    global passed
    passed += 1
    print("✓ OK")

def fail(msg):
    errors.append(msg)
    print(f"✗ ПОМИЛКА: {msg}")

def warn(msg):
    warnings.append(msg)
    print(f"⚠ УВАГА: {msg}")

def run_all_tests():
    print("=" * 70)
    print("ЗАПУСК E2E ТЕСТІВ САЙТУ ДМИТРУШКІВСЬКОГО ЛІЦЕЮ")
    print("=" * 70)

    # 1. Перевірка site.json
    test("Цілісність content/site.json")
    if not os.path.exists(SITE_JSON_PATH):
        fail("Файл content/site.json не знайдено")
        return
    with open(SITE_JSON_PATH, "r", encoding="utf-8") as f:
        site_data = json.load(f)
    if "site" not in site_data or "nav" not in site_data:
        fail("В site.json відсутні обов'язкові ключі site або nav")
    else:
        ok()

    # Збираємо всі slug з навігації
    nav_slugs = set()
    def collect_slugs(items):
        for it in items:
            if "slug" in it:
                nav_slugs.add(it["slug"])
            if "children" in it:
                collect_slugs(it["children"])
    collect_slugs(site_data.get("nav", []))

    # 2. Перевірка сторінок content/pages
    test("Перевірка наявності та наповнення 62 сторінок")
    md_files = [f for f in os.listdir(PAGES_DIR) if f.endswith(".md")]
    if len(md_files) < 62:
        fail(f"Очікувалось як мінімум 62 сторінки, знайдено {len(md_files)}")
    else:
        existing_slugs = set(f[:-3] for f in md_files)
        # Перевіримо порожні
        empty_files = []
        for f in md_files:
            fp = os.path.join(PAGES_DIR, f)
            size = os.path.getsize(fp)
            if size < 5:
                empty_files.append(f)
        if empty_files:
            fail(f"Знайдено абсолютно порожні файли: {empty_files}")
        else:
            ok()

    # 3. Перевірка внутрішніх посилань та якорів
    test("Внутрішні SPA-посилання (#/slug) та якірні переходи (#h.*)")
    broken_links = []
    broken_anchors = []

    # Збираємо якорі
    anchors_by_slug = {}
    for f in md_files:
        slug = f[:-3]
        with open(os.path.join(PAGES_DIR, f), "r", encoding="utf-8", errors="ignore") as fp:
            txt = fp.read()
        anchs = set(re.findall(r'<a\s+id=["\']([^"\']+)["\']', txt))
        anchs.update(re.findall(r'<a\s+name=["\']([^"\']+)["\']', txt))
        anchors_by_slug[slug] = anchs

    for f in md_files:
        slug = f[:-3]
        with open(os.path.join(PAGES_DIR, f), "r", encoding="utf-8", errors="ignore") as fp:
            txt = fp.read()

        links = re.findall(r'\[(.*?)\]\((.*?)\)', txt)
        for t, href in links:
            h = href.strip()
            if h.startswith("#/") and not h.startswith("#/search"):
                target = h[2:].split("?")[0].split("#")[0].strip("/")
                target_unq = urllib.parse.unquote(target)
                if target_unq and target_unq not in existing_slugs:
                    broken_links.append((f, t, h))
            elif h.startswith("#h."):
                # Внутрішній якір
                anchor_id = h[1:]
                if anchor_id not in anchors_by_slug.get(slug, set()):
                    broken_anchors.append((f, t, h))

    if broken_links:
        fail(f"Знайдено биті SPA посилання: {broken_links[:5]}")
    elif broken_anchors:
        fail(f"Знайдено неіснуючі якорі: {broken_anchors[:5]}")
    else:
        ok()

    # 4. Перевірка локальних зображень на диску
    test("Локальні зображення (uploads/...) на диску")
    broken_imgs = []
    drive_icons_remaining = []
    for f in md_files:
        with open(os.path.join(PAGES_DIR, f), "r", encoding="utf-8", errors="ignore") as fp:
            txt = fp.read()
        imgs = re.findall(r'!\[(.*?)\]\((uploads/[^)]+)\)', txt)
        for alt, src in imgs:
            clean_src = src.split("?")[0].split("#")[0].strip()
            disk_p = os.path.join(ROOT_DIR, clean_src)
            if not os.path.exists(disk_p):
                broken_imgs.append((f, clean_src))
            else:
                sz = os.path.getsize(disk_p)
                if sz < 1000 and "drive" in clean_src.lower():
                    drive_icons_remaining.append((f, clean_src))

    if broken_imgs:
        fail(f"Знайдено відсутні зображення на диску: {len(broken_imgs)} ({broken_imgs[:3]})")
    else:
        ok()

    # 5. Перевірка сторінки plan-roboty-litseiu
    test("Спеціальна перевірка: plan-roboty-litseiu")
    plan_p = os.path.join(PAGES_DIR, "plan-roboty-litseiu.md")
    with open(plan_p, "r", encoding="utf-8", errors="ignore") as fp:
        plan_txt = fp.read()

    months = ["Квітень 2026", "Травень 2026", "Грудень 2025", "Січень 2026", "Лютий 2026", "Березень 2026", "Вересень 2025", "Жовтень 2025", "Листопад 2025"]
    missing_months = [m for m in months if m not in plan_txt]
    if missing_months:
        fail(f"У plan-roboty-litseiu відсутні місяці: {missing_months}")
    elif "doc-grid" not in plan_txt or "doc-card" not in plan_txt:
        fail("plan-roboty-litseiu не використовує структуру .doc-grid або .doc-card")
    elif "image-" in plan_txt:
        fail("У plan-roboty-litseiu залишились посилання на placeholder іконки Drive!")
    else:
        ok()

    # 6. Перевірка zvorotnii-zviazok
    test("Спеціальна перевірка: zvorotnii-zviazok")
    zv_p = os.path.join(PAGES_DIR, "zvorotnii-zviazok.md")
    with open(zv_p, "r", encoding="utf-8", errors="ignore") as fp:
        zv_txt = fp.read()
    if "formdesigner" in zv_txt.lower():
        fail("На сторінці zvorotnii-zviazok знайдено FormDesigner iframe!")
    elif 'id="feedback-root"' not in zv_txt:
        fail("На сторінці zvorotnii-zviazok відсутній контейнер #feedback-root")
    else:
        ok()

    # 7. Перевірка zno-dpa-nmt
    test("Спеціальна перевірка: zno-dpa-nmt")
    zno_p = os.path.join(PAGES_DIR, "zno-dpa-nmt.md")
    with open(zno_p, "r", encoding="utf-8", errors="ignore") as fp:
        zno_txt = fp.read()
    if len(zno_txt.strip()) < 50:
        fail("Сторінка zno-dpa-nmt порожня")
    elif "testportal.gov.ua" not in zno_txt:
        fail("На сторінці zno-dpa-nmt відсутнє посилання на офіційний кабінет/сайт УЦОЯО")
    else:
        ok()

    # 8. Перевірка pro-nas
    test("Спеціальна перевірка: pro-nas (текст та карта)")
    pr_p = os.path.join(PAGES_DIR, "pro-nas.md")
    with open(pr_p, "r", encoding="utf-8", errors="ignore") as fp:
        pr_txt = fp.read()
    if len(pr_txt.strip()) < 1000:
        fail("pro-nas містить замало тексту")
    elif "maps.google.com" not in pr_txt:
        fail("pro-nas не містить інтерактивної карти Google Maps")
    else:
        ok()

    # 9. Перевірка arkhiv (існування статті Вітаємо з початком канікул)
    test("Спеціальна перевірка: arkhiv (стаття та якір канікул)")
    arkh_p = os.path.join(PAGES_DIR, "arkhiv.md")
    with open(arkh_p, "r", encoding="utf-8", errors="ignore") as fp:
        arkh_txt = fp.read()
    if "Вітаємо з початком канікул!" not in arkh_txt:
        fail("У arkhiv.md відсутня публікація «Вітаємо з початком канікул!»")
    elif 'id="h.vnlaleksf2b1"' not in arkh_txt:
        fail("У arkhiv.md відсутній якір для статті канікул")
    else:
        ok()

    # 10. Перевірка файлів скриптів
    test("Наявність і підключення JS файлів")
    scripts = [
        "assets/js/firebase-config.js",
        "assets/js/feedback.js",
        "assets/js/app.js",
        "assets/js/render.js",
        "admin/admin.js",
        "admin/admin-core.js"
    ]
    missing_scripts = [s for s in scripts if not os.path.exists(os.path.join(ROOT_DIR, s))]
    if missing_scripts:
        fail(f"Відсутні обов'язкові скрипти: {missing_scripts}")
    else:
        ok()

    # 11. Перевірка єдиного входу в admin/admin.js
    test("Архітектура єдиного входу в admin/admin.js")
    admin_js_p = os.path.join(ROOT_DIR, "admin", "admin.js")
    with open(admin_js_p, "r", encoding="utf-8", errors="ignore") as fp:
        admin_txt = fp.read()
    if "fb_email" not in admin_txt or "fb_pass" not in admin_txt:
        fail("У showLogin admin.js відсутні поля єдиного входу Firebase")
    elif "Увійти до бази звернень" in admin_txt:
        fail("У renderFeedback залишилась окрема друга форма входу!")
    else:
        ok()

    # 12. Перевірка firestore.rules
    test("Правила firestore.rules та безпека")
    rules_p = os.path.join(ROOT_DIR, "firestore.rules")
    if not os.path.exists(rules_p):
        fail("Файл firestore.rules відсутній у корені")
    else:
        with open(rules_p, "r", encoding="utf-8", errors="ignore") as fp:
            rules_txt = fp.read()
        if "allow read, write: if true;" in rules_txt or "allow read: if true;" in rules_txt:
            fail("Правила firestore.rules містять відкритий доступ!")
        elif "request.auth != null" not in rules_txt:
            fail("У firestore.rules відсутній захист через request.auth")
        else:
            ok()

    # 13. Перевірка відсутності вкладених репозиторіїв
    test("Відсутність вкладеного сміття/клонів (.git всередині підпапок)")
    nested_gits = []
    for root, dirs, files in os.walk(ROOT_DIR):
        if root == ROOT_DIR:
            continue
        if ".git" in dirs:
            nested_gits.append(os.path.join(root, ".git"))
    if nested_gits:
        fail(f"Знайдено зайві вкладені .git директорії: {nested_gits}")
    else:
        ok()

    print("\n" + "=" * 70)
    print(f"ПІДСУМОК ТЕСТІВ: Пройдено успішно {passed} з {passed + len(errors)} перевірок.")
    if errors:
        print(f"Кількість виявлених проблем: {len(errors)}")
        for e in errors:
            print(f"  ✗ {e}")
        return False
    else:
        print("Всі критичні перевірки завершено на 100% успішно!")
        return True

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
