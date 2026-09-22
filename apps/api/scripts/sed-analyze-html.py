import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/sed-status3.html"
try:
    html = open(path, "rb").read().decode("cp1251", "replace")
except FileNotFoundError:
    print(path, "missing")
    sys.exit(1)

print("===", path, "len", len(html))
for term in [
    "sed-pagination",
    "page-count",
    "totalPages",
    "currentPage",
    "s-doc__item",
    "document.php?page",
]:
    print(term, "yes" if term.lower() in html.lower() else "no")

rows = len(re.findall(r'name="s-doc__item"', html, re.I))
print("rows", rows)
m = re.search(r"На\s+рассмотрении[^<]*(?:<[^>]+>[^<]*){0,3}\((\d+)\)", html, re.I)
print("total pending", m.group(1) if m else None)

for pat in [
    r'page-count="(\d+)"',
    r'"totalPages"\s*:\s*(\d+)',
    r"[?&]page=(\d+)",
    r"list_page=(\d+)",
]:
    ms = re.findall(pat, html, re.I)
    if ms:
        print(pat, ms[:10])

idx = html.lower().find("pagination")
if idx >= 0:
    print("ctx", re.sub(r"\s+", " ", html[max(0, idx - 100) : idx + 500])[:600])
