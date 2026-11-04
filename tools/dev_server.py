"""Serve the portfolio and write data/data.json from the editor (no download dialog).

Usage (from anywhere):
    python tools/dev_server.py

Then open the editor URL printed below (default port 8765).
"""
from __future__ import annotations

import base64
import binascii
import json
import re
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "data.json"
IMAGES = ROOT / "assets" / "images"
MAX_JSON_BYTES = 8_000_000
MAX_IMAGE_BYTES = 8_000_000
MAX_UPLOAD_JSON = 12_000_000
MIME_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/editor":
            self._json(
                200,
                {
                    "save": True,
                    "upload": True,
                    "path": "data/data.json",
                    "imagesDir": "assets/images",
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = self.path.split("?", 1)[0]
        if route == "/api/save-data":
            self._save_data()
        elif route == "/api/upload-image":
            self._upload_image()
        else:
            self.send_error(404)

    def _read_json_body(self, max_bytes: int) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > max_bytes:
            self.send_error(413 if length > max_bytes else 400)
            raise ValueError("bad length")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(400, "Invalid JSON")
            raise ValueError("bad json") from None
        if not isinstance(payload, dict):
            self.send_error(400, "Expected a JSON object")
            raise ValueError("not object")
        return payload

    def _save_data(self) -> None:
        try:
            payload = self._read_json_body(MAX_JSON_BYTES)
        except ValueError:
            return
        DATA.parent.mkdir(parents=True, exist_ok=True)
        if DATA.exists():
            shutil.copy2(DATA, DATA.with_suffix(".json.bak"))
        DATA.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        self._json(200, {"ok": True, "path": "data/data.json"})

    def _upload_image(self) -> None:
        try:
            payload = self._read_json_body(MAX_UPLOAD_JSON)
        except ValueError:
            return
        project_id = str(payload.get("projectId", "")).strip()
        mime = str(payload.get("mime", "")).split(";", 1)[0].strip().lower()
        raw_b64 = payload.get("data")
        if not project_id or not isinstance(raw_b64, str):
            self.send_error(400, "projectId and data required")
            return
        if mime == "image/pjpeg":
            mime = "image/jpeg"
        ext = MIME_EXT.get(mime)
        if not ext:
            self.send_error(400, f"Unsupported image type: {mime or 'unknown'}")
            return
        try:
            blob = base64.b64decode(raw_b64, validate=True)
        except (ValueError, binascii.Error):
            self.send_error(400, "Invalid image data")
            return
        if len(blob) > MAX_IMAGE_BYTES:
            self.send_error(413, "Image too large")
            return
        slug = re.sub(r"[^a-z0-9-]+", "-", project_id.lower()).strip("-") or "project"
        IMAGES.mkdir(parents=True, exist_ok=True)
        n = 1
        while True:
            name = f"{slug}-{n}{ext}" if n > 1 else f"{slug}{ext}"
            dest = IMAGES / name
            if not dest.exists():
                break
            n += 1
        dest.write_bytes(blob)
        rel = f"assets/images/{name}"
        self._json(200, {"ok": True, "path": rel, "file": name})

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        if args and ("/api/" in str(args[0])):
            super().log_message(fmt, *args)


def _probe_editor_api(port: int) -> str | None:
    """Return 'stale', 'ok', or None if nothing is listening."""
    import urllib.error
    import urllib.request

    url = f"http://127.0.0.1:{port}/api/editor"
    try:
        with urllib.request.urlopen(url, timeout=1) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None
    if data.get("upload"):
        return "ok"
    if data.get("save"):
        return "stale"
    return None


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    existing = _probe_editor_api(port)
    if existing == "ok":
        print(f"Dev server already running on port {port} (upload OK).")
        print(f"  Editor: http://127.0.0.1:{port}/tools/editor.html")
        return
    if existing == "stale":
        print(f"ERROR: Port {port} has an OLD dev server without image upload.")
        print("  Stop every python server (Ctrl+C in all terminals), or run:")
        print(f"  python tools/dev_server.py {port + 1}")
        sys.exit(1)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving {ROOT}  (save + image upload API)")
    print(f"  Site:   http://127.0.0.1:{port}/")
    print(f"  Editor: http://127.0.0.1:{port}/tools/editor.html")
    print("  Restart this after updating tools/dev_server.py or tools/editor.js")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
