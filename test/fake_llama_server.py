"""Mock HTTP server mimicking llama-server's /health and /v1/chat/completions.

Used for integration tests of LocalLLMManager without the real binary/model
downloaded (network is unavailable in CI / sandboxed environments).

Usage:
    python test/fake_llama_server.py [--port 8766] [--key test-key]
    # Ctrl+C to stop.
"""
from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

# State of the fake server, shared across threads.
STATE = {
    "ready_at": 0.0,  # epoch when /health starts returning 200
    "load_delay": 0.0,  # seconds before /health returns 200 (simulates model loading)
    "crash_after": 0.0,  # seconds before the server exits on its own
    "api_key": "",
}


def make_handler():
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args, **kwargs):
            pass

        def _send(self, status, payload):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _check_key(self):
            if not STATE["api_key"]:
                return True
            auth = self.headers.get("Authorization", "")
            return auth == f"Bearer {STATE['api_key']}"

        def do_GET(self):
            if self.path == "/health":
                if time.monotonic() >= STATE["ready_at"]:
                    self._send(200, {"status": "ok"})
                else:
                    self._send(503, {"status": "loading"})
            else:
                self._send(404, {"detail": "Not found"})

        def do_POST(self):
            if not self._check_key():
                self._send(401, {"detail": "Unauthorized"})
                return
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self._send(400, {"detail": "Invalid JSON"})
                return

            if self.path == "/v1/chat/completions":
                user_msg = ""
                for m in data.get("messages", []):
                    if m.get("role") == "user":
                        user_msg = m.get("content", "")
                reply = json.dumps({"steps": [{"text": f"Réponse de test : {user_msg[:30]}"}]})
                self._send(
                    200,
                    {
                        "id": "fake-llama",
                        "object": "chat.completion",
                        "choices": [
                            {
                                "index": 0,
                                "message": {"role": "assistant", "content": reply},
                                "finish_reason": "stop",
                            }
                        ],
                    },
                )
            else:
                self._send(404, {"detail": "Not found"})

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Fake llama-server for tests.")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--key", type=str, default="")
    parser.add_argument("--load-delay", type=float, default=0.0)
    parser.add_argument("--crash-after", type=float, default=0.0)
    args = parser.parse_args()

    STATE["api_key"] = args.key
    STATE["load_delay"] = args.load_delay
    STATE["crash_after"] = args.crash_after
    STATE["ready_at"] = time.monotonic() + args.load_delay

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler())
    print(f"fake-llama-server listening on 127.0.0.1:{args.port}", flush=True)

    def shutdown(signum, frame):
        server.shutdown()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    if args.crash_after > 0:
        def self_destruct():
            time.sleep(args.crash_after)
            print("fake-llama-server self-destructing", flush=True)
            server.shutdown()

        import threading

        threading.Thread(target=self_destruct, daemon=True).start()

    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())