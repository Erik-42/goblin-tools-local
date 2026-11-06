"""Programmatic entry point used by both `python run.py` and the packaged .exe."""
import argparse
import os
import socket
import sys
import threading
import time
import webbrowser

import uvicorn

# Pré-configurer GOBLIN_DATA_DIR avant toute importation du serveur
# (paths.py lit GOBLIN_DATA_DIR à l'import pour fixer SETTINGS_PATH).
for _i, _arg in enumerate(sys.argv):
    if _arg == "--data-dir" and _i + 1 < len(sys.argv):
        os.environ["GOBLIN_DATA_DIR"] = sys.argv[_i + 1]
        break

from server import __version__
from server.main import app
from server.settings_store import load as load_settings

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
    parser = argparse.ArgumentParser(description="Goblin Tools — édition locale")
    parser.add_argument("--host", default=None, help="Host d'écoute")
    parser.add_argument("--port", type=int, default=None, help="Port d'écoute")
    parser.add_argument(
        "--mode", choices=["local", "server"], default=None, help="Mode déploiement"
    )
    parser.add_argument("--data-dir", default=None, help="Répertoire de données")
    args = parser.parse_args()

    settings = load_settings()

    mode = args.mode or settings.get("mode") or "local"
    host = args.host or settings.get("host") or (
        "127.0.0.1" if mode == "local" else "0.0.0.0"
    )
    port = args.port or int(settings.get("port") or PREFERRED_PORT)

    # Si le port est déjà pris, prendre le suivant disponible.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            port = pick_port(port + 1)

    url = f"http://{host}:{port}"
    print(f"Goblin Tools — édition locale v{__version__} [{mode}]  ->  {url}")
    print("Ferme cette fenêtre pour arrêter le service.")
    if host == "127.0.0.1":
        open_browser_later(url)
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
