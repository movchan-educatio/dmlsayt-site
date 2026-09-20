#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Перенесення сторінок зі старого Google Sites у цей сайт.

Що робить:
  • бере адреси сторінок з tools/source_map.json;
  • завантажує кожну сторінку (з інтернету або з файлів, збережених у браузері);
  • перетворює її на Markdown (заголовки, абзаци, списки, таблиці, посилання);
  • завантажує зображення в uploads/pages/<адреса>/;
  • документи Google Диску та відео YouTube вставляє як вбудовані елементи;
  • записує content/pages/<адреса>.md і знімає позначку «не заповнено» в меню.

Потрібно: Python 3.9+ та  pip install beautifulsoup4 requests
Для сторінок, які не віддають текст без скриптів:  pip install playwright && playwright install chromium

Приклади (запускайте з кореня репозиторію):
  python tools/migrate_google_sites.py --list                 # що ще не перенесено
  python tools/migrate_google_sites.py --all                  # перенести всі, що ще «не заповнені»
  python tools/migrate_google_sites.py --only statut novyny   # лише вказані адреси
  python tools/migrate_google_sites.py --all --render         # через браузер (надійніше)
  python tools/migrate_google_sites.py --from-dir saved       # з файлів saved/<адреса>.html
"""
import argparse, json, mimetypes, os, re, shutil, sys, time
from urllib.parse import quote, unquote, urlparse, parse_qs, urljoin

try:
    from bs4 import BeautifulSoup, NavigableString, Tag
except ImportError:
    sys.exit("Потрібен пакет beautifulsoup4:  pip install beautifulsoup4 requests")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_BASE = "https://sites.google.com/view/dmlsayt"
STUB_MARK = "ще переносяться зі старого сайту"

SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "header", "footer", "button", "form", "input", "select", "textarea", "template"}
INLINE_TAGS = {"a", "span", "b", "strong", "i", "em", "u", "br", "code", "sup", "sub", "font", "small", "mark", "s", "del", "label", "abbr", "time"}


class Ctx:
    def __init__(self, slug, page_url, base_dir=None, download=True, session=None, out_root=ROOT):
        self.slug, self.page_url, self.base_dir = slug, page_url, base_dir
        self.download, self.session, self.out_root = download, session, out_root
        self.img_n = 0
        self.warnings = []


# ---------------- допоміжне ----------------
def unwrap_google(url):
    """https://www.google.com/url?q=REAL&sa=... → REAL"""
    if not url:
        return url
    p = urlparse(url)
    if p.netloc.endswith("google.com") and p.path == "/url":
        q = parse_qs(p.query).get("q")
        if q:
            return q[0]
    return url


def clean_text(s):
    s = s.replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"[ \t\r\n]+", " ", s)


def esc_text(s):
    return s.replace("\\", "\\\\").replace("<", "&lt;").replace(">", "&gt;")


def style_flags(tag):
    st = (tag.get("style") or "").lower().replace(" ", "")
    bold = "font-weight:bold" in st or bool(re.search(r"font-weight:(600|700|800|900)", st))
    ital = "font-style:italic" in st
    return bold, ital


def wrap_marks(text, mark):
    if not text.strip():
        return text
    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    return f"{lead}{mark}{text.strip()}{mark}{trail}"


# ---------------- зображення ----------------
def save_image(src, ctx):
    """Повертає шлях відносно кореня сайту (uploads/...) або None."""
    if not src or src.startswith("data:"):
        return None
    if not ctx.download:
        return src
    data, ctype = None, ""
    try:
        if re.match(r"^https?://", src) or src.startswith("//"):
            url = "https:" + src if src.startswith("//") else src
            if ctx.session is None:
                import requests
                ctx.session = requests.Session()
                ctx.session.headers["User-Agent"] = "Mozilla/5.0 (site-migration)"
            r = ctx.session.get(url, timeout=60)
            r.raise_for_status()
            data, ctype = r.content, r.headers.get("Content-Type", "")
        elif ctx.base_dir:
            path = os.path.normpath(os.path.join(ctx.base_dir, unquote(src.split("?")[0])))
            if os.path.exists(path):
                data = open(path, "rb").read()
                ctype = mimetypes.guess_type(path)[0] or ""
    except Exception as e:  # noqa
        ctx.warnings.append(f"Не вдалося завантажити зображення {src[:80]}: {e}")
        return None
    if not data:
        ctx.warnings.append(f"Зображення не знайдено: {src[:80]}")
        return None
    ext = mimetypes.guess_extension(ctype.split(";")[0].strip()) or ""
    if ext in (".jpe", ".jpeg"):
        ext = ".jpg"
    if not ext:
        ext = ".png" if data[:4] == b"\x89PNG" else ".gif" if data[:3] == b"GIF" else ".webp" if data[8:12] == b"WEBP" else ".jpg"
    ctx.img_n += 1
    rel = f"uploads/pages/{ctx.slug}/image-{ctx.img_n}{ext}"
    full = os.path.join(ctx.out_root, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "wb").write(data)
    return rel


# ---------------- вбудовані елементи ----------------
def embed_markdown(src, title, ctx):
    src = unwrap_google(src or "")
    m = re.search(r"youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{11})", src)
    if m:
        return f'<iframe src="https://www.youtube-nocookie.com/embed/{m.group(1)}" title="{title or "Відео"}" allowfullscreen></iframe>'
    m = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)", src)
    if m:
        i = m.group(1)
        return (f'<iframe src="https://drive.google.com/file/d/{i}/preview" title="{title or "Документ"}"></iframe>\n\n'
                f"[Завантажити файл](https://drive.google.com/uc?export=download&id={i})")
    m = re.search(r"docs\.google\.com/(document|spreadsheets|presentation)/d/([A-Za-z0-9_-]+)", src)
    if m:
        kind, i = m.groups()
        tail = "embed" if kind == "presentation" else "preview"
        return f'<iframe src="https://docs.google.com/{kind}/d/{i}/{tail}" title="{title or "Документ"}"></iframe>'
    if "docs.google.com/forms" in src:
        return f'<iframe src="{src.split("?")[0].replace("/edit", "/viewform")}?embedded=true" title="Форма"></iframe>'
    if "google.com/maps/embed" in src:
        return f'<iframe src="{src}" title="Карта"></iframe>'
    if "facebook.com/plugins" in src:
        return None  # стрічку Facebook показує головна сторінка через налаштування
    return None


def data_code_blocks(code, ctx):
    """Блок «Вставка з коду»: у атрибуті data-code лежить HTML (наприклад, банер із посиланням)."""
    inner = BeautifulSoup(code, "html.parser")
    out = blocks_from_children(inner, ctx)
    return out


# ---------------- inline ----------------
def inline(node, ctx):
    if isinstance(node, NavigableString):
        if node.parent and node.parent.name in SKIP_TAGS:
            return ""
        return esc_text(clean_text(str(node)))
    if not isinstance(node, Tag) or node.name in SKIP_TAGS:
        return ""
    n = node.name
    if n == "br":
        return "  \n"
    if n == "img":
        p = save_image(node.get("src"), ctx)
        return f"![{(node.get('alt') or '').strip()}]({p})" if p else ""
    inner = "".join(inline(c, ctx) for c in node.children)
    if n == "a":
        href = unwrap_google(node.get("href") or "")
        if not href or href.startswith("javascript"):
            return inner
        href = urljoin(ctx.page_url, href) if not re.match(r"^(https?:|mailto:|tel:|#)", href) else href
        href = _internal_link(href)
        text = inner.strip() or href
        return f"[{text}]({href})"
    bold = n in ("b", "strong")
    ital = n in ("i", "em")
    sb, si = style_flags(node)
    bold, ital = bold or sb, ital or si
    if n == "code":
        return f"`{inner}`" if inner.strip() else inner
    if bold and re.search(r"\S", inner):
        inner = wrap_marks(inner, "**")
    if ital and re.search(r"\S", inner):
        inner = wrap_marks(inner, "*")
    return inner


def _internal_link(href):
    """Посилання на інші сторінки старого сайту → внутрішні адреси нового сайту."""
    m = re.match(r"^https://sites\.google\.com/view/dmlsayt/?([^?#]*)", href)
    if not m:
        return href
    path = unquote(m.group(1)).strip("/")
    if not path:
        return "#/"
    sm = _SOURCE_MAP_REV.get(path)
    return f"#/{sm}" if sm else href


_SOURCE_MAP_REV = {}


# ---------------- блоки ----------------
def paragraph(text):
    text = re.sub(r"[ ]{2,}(?!\n)", " ", text).strip()
    text = re.sub(r"(  \n)+\s*$", "", text)
    if not text:
        return None
    # у Google Sites підзаголовки часто є лише жирним абзацом → робимо заголовком
    m = re.fullmatch(r"\*\*([^*\n]{2,100}?)\*\*", text)
    if m and not re.search(r"[.!?:;,]$", m.group(1).strip()):
        return "## " + m.group(1).strip()
    if re.match(r"^(#{1,6}\s|[-+*]\s|>\s)", text):
        text = "\\" + text
    return text


def list_md(node, ctx, depth=0):
    ordered = node.name == "ol"
    lines, i = [], 1
    for li in node.find_all("li", recursive=False):
        sub = [c for c in li.children if isinstance(c, Tag) and c.name in ("ul", "ol")]
        head = "".join(inline(c, ctx) for c in li.children if not (isinstance(c, Tag) and c.name in ("ul", "ol")))
        head = re.sub(r"\s+", " ", head).strip()
        marker = f"{i}." if ordered else "-"
        lines.append("    " * depth + f"{marker} {head}")
        for s in sub:
            lines.append(list_md(s, ctx, depth + 1))
        i += 1
    return "\n".join(lines)


def table_md(node, ctx):
    rows = []
    for tr in node.find_all("tr"):
        cells = [re.sub(r"\s+", " ", "".join(inline(c, ctx) for c in td.children)).strip().replace("|", "\\|")
                 for td in tr.find_all(["td", "th"], recursive=False)]
        if cells:
            rows.append(cells)
    if not rows:
        return None
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    out = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join(["---"] * width) + " |"]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)


def is_inline_node(c):
    return isinstance(c, NavigableString) or (isinstance(c, Tag) and c.name in INLINE_TAGS and not c.find(["img", "iframe", "table", "ul", "ol", "p", "h1", "h2", "h3", "h4", "h5", "h6", "div"]))


def blocks_from_children(node, ctx):
    out, buf = [], []

    def flush():
        if buf:
            p = paragraph("".join(inline(b, ctx) for b in buf))
            if p:
                out.append(p)
            buf.clear()

    for c in node.children:
        if isinstance(c, Tag) and c.name in SKIP_TAGS:
            continue
        if is_inline_node(c):
            buf.append(c)
        else:
            flush()
            out.extend(block(c, ctx))
    flush()
    return out


def block(node, ctx):
    if isinstance(node, NavigableString):
        t = paragraph(esc_text(clean_text(str(node))))
        return [t] if t else []
    if not isinstance(node, Tag) or node.name in SKIP_TAGS:
        return []
    if node.get("aria-hidden") == "true" and not node.get_text(strip=True):
        return []
    n = node.name
    if re.fullmatch(r"h[1-6]", n):
        text = re.sub(r"\s+", " ", "".join(inline(c, ctx) for c in node.children)).strip().replace("**", "")
        level = min(max(int(n[1]), 2), 4)
        return [f"{'#' * level} {text}"] if text else []
    if n == "p":
        # абзац із зображенням/вбудовуванням усередині
        if node.find(["img", "iframe"]):
            return blocks_from_children(node, ctx)
        p = paragraph("".join(inline(c, ctx) for c in node.children))
        return [p] if p else []
    if n in ("ul", "ol"):
        t = list_md(node, ctx)
        return [t] if t.strip() else []
    if n == "table":
        t = table_md(node, ctx)
        return [t] if t else []
    if n == "hr":
        return ["---"]
    if n == "blockquote":
        inner = "\n\n".join(blocks_from_children(node, ctx))
        return ["\n".join("> " + l if l else ">" for l in inner.split("\n"))] if inner.strip() else []
    if n == "img":
        p = save_image(node.get("src"), ctx)
        return [f"![{(node.get('alt') or '').strip()}]({p})"] if p else []
    if n == "a" and node.find("img") and not node.get_text(strip=True):
        img = node.find("img")
        p = save_image(img.get("src"), ctx)
        href = _internal_link(unwrap_google(node.get("href") or ""))
        if not p:
            return []
        pic = f"![{(img.get('alt') or '').strip()}]({p})"
        return [f"[{pic}]({href})" if href else pic]
    if n == "a":
        p = paragraph(inline(node, ctx))
        return [p] if p else []
    if n == "iframe":
        code = node.get("data-code")
        if code:
            return data_code_blocks(code, ctx)
        md = embed_markdown(node.get("src"), node.get("title") or node.get("aria-label"), ctx)
        if not md and "youtube" in (node.get("aria-label") or "").lower():
            m = re.search(r"([A-Za-z0-9_-]{11})(?:\.html)?$", (node.get("src") or "").split("?")[0])
            if m:
                md = embed_markdown(f"https://www.youtube.com/embed/{m.group(1)}", node.get("title"), ctx)
        if md:
            return [md]
        src = node.get("src") or ""
        if src and "googleusercontent.com/embeds" not in src and "facebook.com/plugins" not in src:
            ctx.warnings.append(f"Пропущено вбудований елемент: {src[:90]}")
        return []
    # контейнери
    return blocks_from_children(node, ctx)


# ---------------- сторінка ----------------
def content_sections(soup):
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    for t in soup.find_all(["header", "nav", "footer"]):
        t.decompose()
    secs = [s for s in soup.find_all("section") if not s.find("section")]
    keep = []
    for s in secs:
        txt = s.get_text(" ", strip=True)
        if txt.startswith("🗺") or txt.startswith("©"):
            continue
        keep.append(s)
    return keep


def convert_html(html, ctx, page_title=None):
    soup = BeautifulSoup(html, "html.parser")
    secs = content_sections(soup)
    if not secs:
        main = soup.find("main") or soup.body
        secs = [main] if main else []
    blocks = []
    for s in secs:
        blocks.extend(blocks_from_children(s, ctx))
    # прибираємо дублікати поспіль і заголовок, що повторює назву сторінки
    res = []
    for b in blocks:
        if res and res[-1] == b:
            continue
        res.append(b)
    if res and page_title:
        first = re.sub(r"^#+\s*", "", res[0]).strip().lower()
        if first == page_title.strip().lower():
            res = res[1:]
    md = "\n\n".join(res)
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    return md


# ---------------- запуск ----------------
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def walk_nodes(nodes, out=None):
    out = out if out is not None else {}
    for n in nodes:
        if n.get("slug"):
            out[n["slug"]] = n
        walk_nodes(n.get("children", []), out)
    return out


def fetch_live(url, render, state):
    if render:
        if "pw" not in state:
            try:
                from playwright.sync_api import sync_playwright
            except ImportError:
                sys.exit("Для --render встановіть:  pip install playwright && playwright install chromium")
            state["p"] = sync_playwright().start()
            state["pw"] = state["p"].chromium.launch()
        page = state["pw"].new_page()
        page.goto(url, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(1200)
        html = page.content()
        page.close()
        return html
    import requests
    if "s" not in state:
        state["s"] = requests.Session()
        state["s"].headers["User-Agent"] = "Mozilla/5.0 (site-migration)"
    r = state["s"].get(url, timeout=60)
    r.raise_for_status()
    return r.text


def main():
    ap = argparse.ArgumentParser(description="Перенесення сторінок із Google Sites")
    ap.add_argument("--base", default=DEFAULT_BASE, help="адреса старого сайту")
    ap.add_argument("--all", action="store_true", help="усі сторінки, позначені «не заповнено»")
    ap.add_argument("--only", nargs="+", metavar="АДРЕСА", help="лише ці сторінки (адреси як у меню, напр. statut)")
    ap.add_argument("--force", action="store_true", help="перезаписати навіть заповнені сторінки")
    ap.add_argument("--render", action="store_true", help="відкривати сторінки через браузер (Playwright)")
    ap.add_argument("--from-dir", metavar="ПАПКА", help="брати HTML із файлів ПАПКА/<адреса>.html")
    ap.add_argument("--no-images", action="store_true", help="не завантажувати зображення")
    ap.add_argument("--list", action="store_true", help="показати, що ще не перенесено")
    ap.add_argument("--dry-run", action="store_true", help="лише показати результат, нічого не записувати")
    ap.add_argument("--root", default=ROOT, help="корінь сайту (за замовчуванням — папка над tools)")
    a = ap.parse_args()

    root = os.path.abspath(a.root)
    site_path = os.path.join(root, "content", "site.json")
    site = load_json(site_path)
    smap = load_json(os.path.join(HERE, "source_map.json"))
    nodes = walk_nodes(site["nav"])
    for slug, gs in smap.items():
        _SOURCE_MAP_REV[gs] = slug

    todo = [s for s, n in nodes.items() if n.get("todo")]
    if a.list:
        print(f"Ще не перенесено: {len(todo)}")
        for s in todo:
            print(f"  {s:60} ← {smap.get(s)}")
        return
    if a.only:
        targets = a.only
    elif a.all:
        targets = todo if not a.force else list(nodes)
    else:
        ap.error("вкажіть --all, --only або --list")
    bad = [t for t in targets if t not in nodes or t not in smap]
    if bad:
        sys.exit("Невідомі адреси: " + ", ".join(bad))

    state, done, empty = {}, 0, []
    for slug in targets:
        node = nodes[slug]
        page_path = os.path.join(root, "content", "pages", f"{slug}.md")
        if os.path.exists(page_path) and not node.get("todo") and not a.force and not a.only:
            continue
        gs_path = smap[slug]
        url = a.base.rstrip("/") + "/" + quote(gs_path)
        base_dir = None
        try:
            if a.from_dir:
                fp = os.path.join(a.from_dir, slug + ".html")
                if not os.path.exists(fp):
                    print(f"[пропуск] {slug}: немає файлу {fp}")
                    continue
                html, base_dir = open(fp, encoding="utf-8", errors="ignore").read(), os.path.dirname(os.path.abspath(fp))
            else:
                html = fetch_live(url, a.render, state)
                time.sleep(0.6)
        except Exception as e:  # noqa
            print(f"[помилка] {slug}: {e}")
            continue
        ctx = Ctx(slug, url, base_dir=base_dir, download=not a.no_images and not a.dry_run, out_root=root)
        md = convert_html(html, ctx, node.get("title"))
        text_len = len(re.sub(r"\s+", "", re.sub(r"!\[[^\]]*\]\([^)]*\)|<iframe.*?</iframe>", "x", md)))
        for w in ctx.warnings:
            print(f"   ! {w}")
        if text_len < 3:
            empty.append(slug)
            if not a.render:
                print(f"[порожньо] {slug}: текст не знайдено (спробуйте --render). Позначку «не заповнено» залишено.")
                continue
        if a.dry_run:
            print(f"----- {slug} -----\n{md}")
            continue
        os.makedirs(os.path.dirname(page_path), exist_ok=True)
        open(page_path, "w", encoding="utf-8").write(md)
        node.pop("todo", None)
        done += 1
        print(f"[ok] {slug}  ({len(md)} символів, зображень: {ctx.img_n})")

    if not a.dry_run and done:
        with open(site_path, "w", encoding="utf-8") as f:
            json.dump(site, f, ensure_ascii=False, indent=2)
            f.write("\n")
    if "pw" in state:
        state["pw"].close(); state["p"].stop()
    print(f"\nГотово. Перенесено сторінок: {done}. Далі перегляньте сайт і опублікуйте зміни (git commit + push).")


if __name__ == "__main__":
    main()
