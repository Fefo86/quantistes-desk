"""Produce the compiled PHP-hosted Next.js build, the WP plugin and modular sources."""
import argparse
import gzip
import hashlib
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
target = args.output.resolve()
target.mkdir(parents=True, exist_ok=True)
compiled = root / "out"
index = (compiled / "index.html").read_text()
assert 'data-access="wordpress"' in index and 'workspaces.' in index
guard = b"<?php http_response_code(404); exit; __halt_compiler(); ?>\n"
mimes = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".txt":"text/plain; charset=utf-8",".svg":"image/svg+xml",".json":"application/json",".woff2":"font/woff2",".ico":"image/x-icon"}
def put(z, name, data, compress=True):
    info = zipfile.ZipInfo(name, (2026,1,1,0,0,0))
    info.external_attr = 0o100644 << 16
    z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED, compresslevel=8 if compress else None)

def tree(z, start, prefix=""):
    for f in sorted(start.rglob("*")):
        if f.is_file():
            put(z, prefix + f.relative_to(start).as_posix(), f.read_bytes())
def php(s):
    return "'" + s.replace("\\","\\\\").replace("'","\\'") + "'"

with zipfile.ZipFile(target/"Quantistes-Hostinger.zip", "w") as z:
    tree(z, root/"hosting/desk")
    rows = []
    seen = set()
    for file in sorted(compiled.rglob("*")):
        if not file.is_file(): continue
        name = "/" + file.relative_to(compiled).as_posix()
        raw = file.read_bytes()
        mime = mimes.get(file.suffix, "application/octet-stream")
        packed = gzip.compress(raw, compresslevel=7, mtime=0)
        use_gzip = len(packed) + 48 < len(raw)
        body = packed if use_gzip else raw
        digest = hashlib.sha256(raw).hexdigest()
        if digest not in seen:
            put(z, "private/files/" + digest + ".php", guard + body, False)
            seen.add(digest)
        rows.append(f"    {php(name)} => [{php(digest)}, {php(mime)}, {len(raw)}, {len(body)}, {'true' if use_gzip else 'false'}],")
    put(z,"private/assets.php","<?php\nreturn [\n"+"\n".join(rows)+"\n];\n")
    art = re.search(r'class="qx-surface"[^>]*>\s*(<svg\b.*?</svg>)',index,re.S)
    if not art: raise ValueError("Superficie del login assente")
    svg = re.sub(r' style="[^"]*"', '', art[1], count=1)
    put(z,"private/surface.php","<?php defined('QUANTISTES_GATEWAY') || exit; ?>\n"+svg)
    for notice in sorted((root/"licenses").glob("*.txt")):
        put(z,"private/licenses/"+notice.name,notice.read_bytes())
with zipfile.ZipFile(target/"Quantistes-WordPress.zip","w") as z:
    tree(z,root/"wordpress")
with zipfile.ZipFile(target/"Quantistes-Sorgenti-Next.zip","w") as z:
    for folder in ["src","desk","scripts","wordpress","hosting","licenses",".github"]:
        tree(z, root/folder,folder+"/")
    for name in ["package.json","package-lock.json","next.config.mjs","README.md","AGGIORNAMENTI.txt","INSTALLAZIONE.html","public/quantistes.svg",".gitignore"]:
        put(z,name,(root/name).read_bytes())
(target/"Quantistes-Installazione.html").write_bytes((root/"INSTALLAZIONE.html").read_bytes())
print("Build protetta:",len(rows),"URL,",len(seen),"file distinti.")
for f in sorted(target.glob("Quantistes-*")):
    print(f.name, f.stat().st_size)
