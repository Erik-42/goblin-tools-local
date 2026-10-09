"""Programmatic entry point used by both `python run.py` and the packaged .exe."""
import socket
import threading
import time
import webbrowser

import uvicorn

from server.main import app

PREFERRED_PORT = 8765


def pick_port(start: int, tries: int = 20) -> int:
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def open_browser_later(url: str) -> None:
    def worker():
        time.sleep(1.2)
        webbrowser.open(url)

    threading.Thread(target=worker, daemon=True).start()


def main() -> None:
    port = pick_port(PREFERRED_PORT)
    url = f"http://127.0.0.1:{port}"
    print(f"Goblin Tools 本地版  ->  {url}")
    print("关闭此窗口即停止服务。")
    open_browser_later(url)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
