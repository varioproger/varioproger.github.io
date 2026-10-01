"""Small HTTP service for observing Kubernetes objects, not a production server."""

import json
import os
import signal
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        status = 200
        if path == "/health":
            payload = {"alive": True}
        elif path == "/ready":
            ready = os.getenv("READY", "true").lower() == "true"
            status = 200 if ready else 503
            payload = {"ready": ready}
        elif path == "/":
            payload = {
                "app": "orders-lab",
                "version": os.getenv("APP_VERSION", "v1"),
                "pod": os.getenv("POD_NAME", socket.gethostname()),
                "greeting": os.getenv("GREETING", "hello"),
            }
        else:
            status = 404
            payload = {"error": "not found"}
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "8080"))), Handler)

    def stop(_signum, _frame):
        # shutdown must run outside the serve_forever thread to avoid deadlock.
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print("orders-lab listening", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
