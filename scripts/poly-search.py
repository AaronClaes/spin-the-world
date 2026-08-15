#!/usr/bin/env python3
"""Search poly.pizza and resolve model pages to a downloadable CC0 GLB.

Used to source the kitbash inputs in assets-src/. Not part of the app build —
run it by hand when a new record needs props, then commit the GLBs it finds so
the build never depends on a third-party site being up.

  ./scripts/poly-search.py search lighthouse
  ./scripts/poly-search.py show <slug>
  ./scripts/poly-search.py get <slug> assets-src/harbour-lighthouse.glb
"""

import json
import re
import subprocess
import sys
import urllib.parse

# curl rather than urllib: the system python here has no CA bundle wired up,
# and this script is a one-off asset fetcher, not something the build runs.
UA = "Mozilla/5.0 (compatible; spin-the-world-asset-fetch)"


def fetch(url: str) -> str:
    return subprocess.run(
        ["curl", "-sSL", "-A", UA, url],
        capture_output=True,
        check=True,
    ).stdout.decode("utf-8", "replace")


def fetch_binary(url: str, dest: str) -> None:
    subprocess.run(["curl", "-sSL", "-A", UA, "-o", dest, url], check=True)


CARD = re.compile(
    r'href="/m/(?P<slug>[A-Za-z0-9_-]+)".*?'
    r'title="(?P<title>[^"]*)".*?'
    r'src="(?P<thumb>https://static\.poly\.pizza/[^"]+)".*?'
    r'href="/u/(?P<creator>[^"]+)"',
    re.S,
)


def search(query: str) -> list[dict]:
    html = fetch("https://poly.pizza/search/" + urllib.parse.quote(query))
    out, seen = [], set()
    for m in CARD.finditer(html):
        d = m.groupdict()
        if d["slug"] in seen:
            continue
        seen.add(d["slug"])
        out.append(d)
    return out


def show(slug: str) -> dict:
    html = fetch("https://poly.pizza/m/" + slug)
    glb = re.search(r"https://static\.poly\.pizza/[0-9a-f-]{36}\.glb", html)
    title = re.search(r"<title>([^<]*)</title>", html)
    creator = re.search(r'href="/u/([^"]+)"', html)
    tris = re.search(r"([\d,]+)\s*(?:triangles|Tris)", html, re.I)
    return {
        "slug": slug,
        "title": title.group(1).strip() if title else None,
        "creator": creator.group(1) if creator else None,
        "cc0": "CC0" in html,
        "tris": tris.group(1) if tris else None,
        "glb": glb.group(0) if glb else None,
    }


def get(slug: str, dest: str) -> None:
    info = show(slug)
    if not info["glb"]:
        raise SystemExit(f"no GLB on the page for {slug}")
    if not info["cc0"]:
        raise SystemExit(f"{slug} is not marked CC0 — not downloading")
    fetch_binary(info["glb"], dest)
    print(json.dumps({**info, "dest": dest}))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "search":
        print(json.dumps(search(sys.argv[2]), indent=1))
    elif cmd == "show":
        print(json.dumps(show(sys.argv[2]), indent=1))
    elif cmd == "get":
        get(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
