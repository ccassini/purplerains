#!/usr/bin/env bash
# Sync validator metadata + logos from monad-developers/validator-info
# Usage: ./scripts/download-logos.sh [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

mkdir -p public/validators mainnet

echo "==> Syncing mainnet JSON from GitHub..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sL "https://codeload.github.com/monad-developers/validator-info/tar.gz/refs/heads/main" \
  | tar -xz -C "$TMP" --strip-components=1
rsync -a --delete "$TMP/mainnet/" ./mainnet/
echo "    $(ls mainnet/*.json | wc -l | tr -d ' ') metadata files"

export FORCE_LOGOS="$FORCE"

echo "==> Downloading logos into public/validators/..."
python3 - <<'PY'
import json, os, re, ssl, concurrent.futures, urllib.request
from pathlib import Path
from urllib.parse import urlparse, unquote

FORCE = os.environ.get("FORCE_LOGOS") == "1"
OUT = Path("public/validators")
OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (compatible; PurpleRainBot/1.0)"
ctx = ssl.create_default_context()

existing = {
    int(f.stem): f
    for f in OUT.iterdir()
    if f.stem.isdigit() and f.is_file() and f.stat().st_size > 50
}

meta = []
for p in Path("mainnet").glob("*.json"):
    d = json.loads(p.read_text())
    if d.get("id") is not None:
        meta.append(d)

def guess_ext(url, content_type, magic):
    if magic.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if magic.startswith(b"\x89PNG"):
        return "png"
    if magic.startswith(b"GIF8"):
        return "gif"
    if magic.startswith(b"RIFF") and b"WEBP" in magic[:16]:
        return "webp"
    if magic.lstrip().startswith(b"<svg") or magic.lstrip().startswith(b"<?xml"):
        return "svg"
    ct = (content_type or "").split(";")[0].strip().lower()
    ct_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/svg+xml": "svg",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    if ct in ct_map:
        return ct_map[ct]
    path = unquote(urlparse(url).path)
    m = re.search(r"\.(png|jpe?g|svg|webp|gif)(?:\?|$)", path, re.I)
    if m:
        e = m.group(1).lower()
        return "jpg" if e in ("jpg", "jpeg") else e
    return "png"

def download_one(m):
    vid = int(m["id"])
    url = (m.get("logo") or "").strip()
    name = m.get("name") or f"#{vid}"
    if not url:
        return ("no_url", vid, name, None)
    if vid in existing and not FORCE:
        return ("skip", vid, name, existing[vid].name)
    if "drive.google.com" in url:
        mid = re.search(r"/d/([a-zA-Z0-9_-]+)", url) or re.search(r"id=([a-zA-Z0-9_-]+)", url)
        if mid:
            url = f"https://drive.google.com/uc?export=download&id={mid.group(1)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            data = resp.read()
            ct = resp.headers.get("Content-Type", "")
            final = resp.geturl()
    except Exception as e:
        # curl fallback for stubborn redirects (308 etc.)
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = tmp.name
        try:
            r = subprocess.run(
                ["curl", "-sL", "--max-time", "20", "-A", UA, "-o", tmp_path, url],
                capture_output=True,
            )
            data = Path(tmp_path).read_bytes() if r.returncode == 0 else b""
            ct, final = "", url
        finally:
            Path(tmp_path).unlink(missing_ok=True)
        if not data:
            return ("fail", vid, name, str(e)[:120])
    if not data or len(data) < 40:
        return ("fail", vid, name, "empty")
    head = data[:200].lstrip().lower()
    if head.startswith(b"<!doctype") or head.startswith(b"<html"):
        return ("fail", vid, name, "html_response")
    ext = guess_ext(final or url, ct, data[:64])
    for old in OUT.glob(f"{vid}.*"):
        old.unlink()
    out = OUT / f"{vid}.{ext}"
    out.write_bytes(data)
    existing[vid] = out
    return ("ok", vid, name, out.name)

ok = fail = skip = nourl = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
    for status, vid, name, info in ex.map(download_one, meta):
        if status == "ok":
            ok += 1
            print(f"  [OK] {vid} {name} -> {info}")
        elif status == "no_url":
            nourl += 1
        elif status == "fail":
            fail += 1
            print(f"  [FAIL] {vid} {name}: {info}")
        else:
            skip += 1

print(f"\nDone: ok={ok} fail={fail} no_url={nourl} skip={skip} total_files={len(existing)}")
PY

echo "==> Updating LOGO_EXTENSIONS in validatorApi.js..."
python3 - <<'PY'
import re
from pathlib import Path

OUT = Path("public/validators")
ext_map = {
    int(f.stem): f.suffix.lstrip(".").lower()
    for f in OUT.iterdir()
    if f.stem.isdigit() and f.is_file() and f.stat().st_size > 50
}
ids = sorted(ext_map)
lines = ["const LOGO_EXTENSIONS = {"]
for i in range(0, len(ids), 8):
    chunk = ids[i : i + 8]
    lines.append("  " + ", ".join(f"{x}: '{ext_map[x]}'" for x in chunk) + ",")
lines.append("}")
new_block = "\n".join(lines)
api = Path("src/utils/validatorApi.js")
text = api.read_text()
pat = re.compile(r"const LOGO_EXTENSIONS = \{[\s\S]*?\n\}")
if not pat.search(text):
    raise SystemExit("LOGO_EXTENSIONS block not found")
api.write_text(pat.sub(new_block, text, count=1))
print(f"Updated LOGO_EXTENSIONS ({len(ext_map)} entries)")
PY

echo "==> Building src/data/mainnetValidators.json..."
python3 - <<'PY'
import json
from pathlib import Path

validators = []
for p in sorted(Path("mainnet").glob("*.json")):
    d = json.loads(p.read_text())
    if not d.get("secp"):
        continue
    validators.append({
        "id": d.get("id"),
        "name": d.get("name") or "",
        "secp": d.get("secp") or "",
        "bls": d.get("bls") or "",
        "logo": d.get("logo") or "",
        "website": d.get("website") or "",
        "description": d.get("description") or "",
        "x": d.get("x") or "",
        "decommissioned": bool(d.get("decommissioned")),
    })
validators.sort(key=lambda v: (v["id"] is None, v["id"] or 0))
out = Path("src/data/mainnetValidators.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(validators, ensure_ascii=False, separators=(",", ":")))
print(f"Wrote {out} ({len(validators)} validators, {out.stat().st_size} bytes)")
PY

echo "==> Complete."
