#!/usr/bin/env python3
"""本機預覽用的簡易伺服器。和 `python3 -m http.server` 的差別：回應帶 no-cache，
修改 CSS / JS 後重新整理就能看到最新版，不會被瀏覽器的舊快取擋住。

用法（在專案根目錄）：
    python3 tools/serve.py [port]      預設 port 8080
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"http://localhost:{port}  (Ctrl+C 結束)")
    ThreadingHTTPServer(("", port), handler).serve_forever()
