#!/usr/bin/env python3
"""Zero-dependency static server for the Forge editor.

`python -m http.server` almost works, but two details break the WASM path on
some systems:

* ``.wasm`` must be served as ``application/wasm`` or
  ``WebAssembly.instantiateStreaming`` refuses the response;
* aggressive caching hides a freshly rebuilt ``pkg/`` behind a stale copy.

This script fixes both and nothing else. Usage::

    python serve.py            # http://127.0.0.1:8080
    python serve.py 3000       # pick a port
    python serve.py 3000 0.0.0.0
"""

from __future__ import annotations

import http.server
import os
import socketserver
import sys
import webbrowser

DEFAULT_PORT = 8080
DEFAULT_HOST = "127.0.0.1"
ROOT = os.path.dirname(os.path.abspath(__file__))

EXTRA_TYPES = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
}


class ForgeHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with correct WASM typing and no client caching."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **EXTRA_TYPES,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self) -> None:
        # No caching: a rebuilt ./pkg must never be shadowed by a stale copy.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        # Deliberately *not* setting COOP/COEP here. Cross-origin isolation is
        # only needed for shared-memory threads, and `require-corp` interferes
        # with the sandboxed srcdoc preview frame.
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  %s\n" % (fmt % args))


class ReusableServer(socketserver.ThreadingTCPServer):
    """Lets you restart the server immediately after stopping it."""

    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    host = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_HOST

    if not os.path.isdir(os.path.join(ROOT, "pkg")):
        print("!  ./pkg is missing — the editor will show a boot error.")
        print("   Build the engine first:  wasm-pack build --target web\n")

    url = f"http://{host}:{port}/"
    # The test runner starts this server itself and drives its own browser.
    open_browser = os.environ.get("FORGE_NO_BROWSER", "") == ""
    try:
        with ReusableServer((host, port), ForgeHandler) as httpd:
            print(f"Forge is served from {ROOT}")
            print(f"Open {url}   (Ctrl+C to stop)\n")
            if open_browser:
                try:
                    webbrowser.open(url)
                except Exception:  # noqa: BLE001 - a headless box has no browser
                    pass
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    except OSError as error:
        print(f"Could not bind {host}:{port} — {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
