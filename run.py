"""Programmatic entry point used by both `python run.py` and the packaged .exe."""
import argparse
import os
import secrets
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

# Pré-configurer GOBLIN_DATA_DIR avant toute importation du serveur
# (paths.py lit GOBLIN_DATA_DIR à l'import pour fixer SETTINGS_PATH).
for _i, _arg in enumerate(sys.argv):
    if _arg == "--data-dir" and _i + 1 < len(sys.argv):
        os.environ["GOBLIN_DATA_DIR"] = sys.argv[_i + 1]
        break

from server import __version__
from server import data_store
from server.local_llm.manager import get_manager, register_shutdown
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

    # Gestionnaire du moteur LLM local : cle API aleatoire par session,
    # arret propre a la sortie (atexit + signaux).
    data_dir = settings.get("data_dir") or None
    manager = get_manager(Path(data_dir) if data_dir else None)
    manager.api_key = secrets.token_urlsafe(16)
    register_shutdown(manager)

    # Si le moteur est deja installe (binaire + modele), le demarrer sans bloquer.
    try:
        _st = manager.status()
        if (
            _st["engine_present"]
            and _st["model_present"]
            and _st["state"] not in ("ready", "starting", "downloading")
        ):
            manager.install()
    except Exception:
        pass

    # Verrou d'instance unique sur la base de donnees persistee.
    try:
        data_store.get_store().acquire_instance_lock()
    except RuntimeError as exc:
        print(f"AVERTISSEMENT : {exc}")
        print("L'application va toutefois continuer (verrou non bloquant en dev).")

    mode = args.mode or settings.get("mode") or "server"
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
