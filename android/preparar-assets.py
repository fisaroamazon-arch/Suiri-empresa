#!/usr/bin/env python3
"""Stage the shared web application and optional assets from the previous APK."""
from pathlib import Path
from shutil import copy2
import sys
from zipfile import ZipFile

project = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
native = Path(__file__).resolve().parent
destination.mkdir(parents=True, exist_ok=True)

if len(sys.argv) == 4:
    with ZipFile(sys.argv[3]) as archive:
        for entry in archive.namelist():
            relative = entry.removeprefix("assets/public/")
            if relative == entry or not relative or relative.endswith("/"):
                continue
            path = Path(relative)
            if path.is_absolute() or ".." in path.parts:
                raise SystemExit(f"Invalid APK resource path: {relative}")
            if path.parts[0] not in ("vendor", "fonts") and path.suffix not in (".png", ".ico"):
                continue
            target = destination / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))

for path in project.iterdir():
    if path.is_file() and (path.name in ("index.html", "manifest.json")
                          or path.suffix in (".js", ".css", ".png", ".ico")):
        copy2(path, destination / path.name)

for folder in ("vendor", "fonts"):
    for asset in (project / folder).rglob("*"):
        if asset.is_file():
            target = destination / asset.relative_to(project)
            target.parent.mkdir(parents=True, exist_ok=True)
            copy2(asset, target)

required = ("index.html", "icon-192x192.png", "marca-suiri.png", "vendor/supabase.js",
            "vendor/html2pdf.bundle.min.js", "vendor/zxing.min.js")
missing = [file for file in required if not (destination / file).is_file()]
if missing:
    raise SystemExit("Faltam os recursos web: " + ", ".join(missing))

# Only the Android shim and the disabled browser service worker differ in this HTML copy.
html = destination / "index.html"
markup = html.read_text(encoding="utf-8")
if "</head>" not in markup:
    raise SystemExit("index.html não tem uma seção head.")
markup = markup.replace("</head>", """<link rel="stylesheet" href="android-web.css">
<script defer src="android-web.js"></script>
</head>""", 1)
markup = markup.replace("if ('serviceWorker' in navigator", "if (!window.SuiriAndroidNative && 'serviceWorker' in navigator", 1)
html.write_text(markup, encoding="utf-8")
for file in ("android-web.js", "android-web.css"):
    copy2(native / file, destination / file)
