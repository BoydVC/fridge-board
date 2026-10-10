#!/usr/bin/env python3
"""Fridge Board server: local only (127.0.0.1:4343 by default). Stdlib only.

GET /              the board
GET /api/board     board data (re-collected from the tutor files if older than FB_MAX_AGE seconds)
GET /api/refresh   force a re-collect now
GET /healthz       ok
"""
import json
import os
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import collect  # noqa: E402

HOST = os.environ.get("FB_HOST", "127.0.0.1")
PORT = int(os.environ.get("FB_PORT", "4343"))
MAX_AGE = int(os.environ.get("FB_MAX_AGE", "600"))
BOARD = os.path.join(HERE, "data", "board.json")
_lock = threading.Lock()


def board(force=False):
    with _lock:
        fresh = os.path.exists(BOARD) and time.time() - os.path.getmtime(BOARD) < MAX_AGE
        if force or not fresh:
            collect.warnings.clear()
            collect.main()
        with open(BOARD, "rb") as f:
            return f.read()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(HERE, "web"), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def _json(self, body, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        try:
            if path == "/api/board":
                return self._json(board())
            if path == "/api/refresh":
                return self._json(board(force=True))
            if path == "/healthz":
                return self._json(b'{"ok":true}')
        except Exception as e:  # keep the kitchen screen alive
            return self._json(json.dumps({"error": str(e)}).encode(), 500)
        if path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[fridge-board] " + (fmt % args) + "\n")


if __name__ == "__main__":
    board(force=True)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Fridge Board on http://{HOST}:{PORT}", flush=True)
    srv.serve_forever()
