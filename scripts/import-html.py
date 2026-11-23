"""Split the supplied document losslessly. Run explicitly when importing a new edition."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "desk"

def group(identifier):
    if identifier in {"qt360-plotly"}:
        return "vendor"
    if identifier.startswith(("report-", "daily-", "dealer-adapter")):
        return "reports"
    if identifier.startswith(("oa-", "scalp-", "desk-strike", "strike-diagnostics")):
        return "scalping"
    if identifier.startswith(("studio-", "institutional-", "decision-", "desk-chart", "desk-measures")):
        return "scoreboard"
    if any(word in identifier for word in ("flow", "dealer")):
        return "dealer"
    if any(word in identifier for word in ("physical", "dynamic-p", "realized", "distribution", "event-explorer", "qt360")):
        return "probability"
    if any(word in identifier for word in ("research", "systematic", "audit", "manual", "backtest")):
        return "research"
    if identifier.startswith(("core-", "quant-core", "vc", "qt-ssvi", "qt-global", "cvi-", "sinemath", "surface", "crash", "tail-", "implied", "wall-tail", "qt-cflex")):
        return "volatility"
    return "terminal"

class Splitter(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0] + [m.end() for m in re.finditer(r"\n", source)]
        self.end = 0
        self.nodes = []
        self.pending = None
        self.body_at = source.index("<body>") + 6

    def absolute_pos(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def save(self, folder, name, ext, value, **fields):
        filename = f"{folder}/{name}.{ext}"
        path = root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        data = value.encode()
        path.write_bytes(data)
        self.nodes.append(dict(path=filename, sha256=hashlib.sha256(data).hexdigest(), **fields))

    def markup(self, start, end):
        raw = self.source[start:end]
        cuts = list(re.finditer(r'<section\b(?=[^>]*\bid="view-([^"]+)")[^>]*>', raw, re.I))
        positions = [(0, "structure")] + [(m.start(), m[1]) for m in cuts]
        for idx, (pos, name) in enumerate(positions):
            text = raw[pos:positions[idx+1][0] if idx+1 < len(positions) else len(raw)]
            if not text: continue
            if text.isspace():
                self.nodes.append({"kind":"space","raw":text})
            else:
                self.save("views", f"{len(self.nodes):03}-{name}", "html", text, kind="markup", body=start+pos>=self.body_at)

    def handle_starttag(self, tag, attrs):
        if tag not in ("script", "style"): return
        start = self.absolute_pos()
        self.markup(self.end, start)
        self.pending = (tag, dict(attrs), self.get_starttag_text(), start+len(self.get_starttag_text()), start>=self.body_at)

    def handle_endtag(self, tag):
        if not self.pending or self.pending[0] != tag: return
        _, attrs, opening, start, body = self.pending
        end = self.absolute_pos()
        closing = self.source[end:self.source.index(">",end)+1]
        identifier = attrs.get("id") or ("terminal-worker" if tag=="script" else f"base-{len(self.nodes):03}")
        typ = attrs.get("type", "")
        kind = "css" if tag=="style" else "data" if typ else "js"
        folder = "styles" if kind=="css" else "data" if kind=="data" else group(identifier)
        ext = "css" if kind=="css" else "js" if kind=="js" else "json" if typ=="application/json" else "txt"
        self.save(folder, identifier, ext, self.source[start:end], kind=kind, id=attrs.get("id"), type=typ, opening=opening, closing=closing, body=body)
        self.end=end+len(closing)
        self.pending=None

parser=argparse.ArgumentParser()
parser.add_argument("html",type=Path)
args=parser.parse_args()
source_bytes=args.html.read_bytes()
source=source_bytes.decode("utf-8")
p=Splitter(source)
p.feed(source)
p.markup(p.end,len(source))
(root/"document.json").write_text(json.dumps({"source":args.html.name,"sha256":hashlib.sha256(source_bytes).hexdigest(),"nodes":p.nodes}, ensure_ascii=False, indent=2)+"\n")
print(f"{len(p.nodes)} frammenti · {len(source_bytes)} byte")
