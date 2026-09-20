import os, sys, re, json, urllib.parse

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES_DIR = os.path.join(ROOT_DIR, "content", "pages")
SITE_JSON_PATH = os.path.join(ROOT_DIR, "content", "site.json")
SOURCE_MAP_PATH = os.path.join(ROOT_DIR, "tools", "source_map.json")

all_files = [f for f in os.listdir(PAGES_DIR) if f.endswith(".md")]
existing_slugs = set(f[:-3] for f in all_files)

print(f"Total markdown pages: {len(all_files)}")

# 1. Search for #h. artifacts in all pages
h_artifacts = {}
for fname in all_files:
    fpath = os.path.join(PAGES_DIR, fname)
    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    # matches like #h.123abc or [#h.123abc](#h.123abc)
    matches = re.findall(r"(?:\[#h\.[a-z0-9_-]+\]\(#h\.[a-z0-9_-]+\)|#h\.[a-z0-9_-]+)", content, re.IGNORECASE)
    if matches:
        h_artifacts[fname] = len(matches)

print(f"\nFiles with #h.* artifacts ({len(h_artifacts)}):")
for fname, count in sorted(h_artifacts.items(), key=lambda x: -x[1])[:15]:
    print(f"  {fname}: {count} artifacts")

# 2. Search for all internal links in all markdown files
internal_link_targets = {}
missing_targets = {}

for fname in all_files:
    fpath = os.path.join(PAGES_DIR, fname)
    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    # search markdown links [text](href)
    links = re.findall(r"\[(.*?)\]\((.*?)\)", content)
    for text, href in links:
        href_clean = href.strip()
        # check if internal
        slug = None
        if href_clean.startswith("#/"):
            slug = href_clean[2:].split("?")[0].split("#")[0].strip("/")
        elif href_clean.startswith("https://sites.google.com/view/dmlsayt"):
            sub = href_clean.replace("https://sites.google.com/view/dmlsayt", "").strip("/")
            slug = sub.split("?")[0].split("#")[0]
        elif not re.match(r"^(https?:|mailto:|tel:|#)", href_clean):
            slug = href_clean.split("?")[0].split("#")[0]
            
        if slug:
            # unquote
            slug_unquoted = urllib.parse.unquote(slug)
            internal_link_targets.setdefault(slug_unquoted, []).append((fname, text, href_clean))
            if slug_unquoted not in existing_slugs:
                missing_targets.setdefault(slug_unquoted, []).append((fname, text, href_clean))

print(f"\nTotal unique internal link targets referenced: {len(internal_link_targets)}")
print(f"Missing targets ({len(missing_targets)}):")
for slug, refs in missing_targets.items():
    print(f"  Target: '{slug}'")
    for r in refs[:3]:
        print(f"     from {r[0]}: [{r[1]}]({r[2]})")

# 3. Search specifically for "канікул" in all pages
print("\nSearching for 'канікул' in markdown files:")
for fname in all_files:
    fpath = os.path.join(PAGES_DIR, fname)
    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    for idx, line in enumerate(lines):
        if "канікул" in line.lower():
            print(f"  {fname}:{idx+1}: {line.strip()[:100]}")
