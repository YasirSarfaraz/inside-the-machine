"""Local dev server for Inside the Machine: like `python -m http.server`, but tells the
browser never to cache, so every reload shows the latest CSS/JS."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


http.server.ThreadingHTTPServer(('', PORT), NoCache).serve_forever()
