"""Resource paths that work both from source and inside a PyInstaller exe.

In a frozen one-file build, read-only bundle data lives under sys._MEIPASS
(a temp dir recreated on every launch), while writable user config must sit
next to the exe so it survives restarts.

Le répertoire de données (config + persistance) est configurable via
GOBLIN_DATA_DIR. En mode LOCAL il vaut APP_DIR (à côté de l'exe) ; en mode
SERVEUR il peut pointer vers un volume monté.
"""
import os
import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)

if FROZEN:
    BUNDLE_DIR = Path(sys._MEIPASS)          # read-only: web/, server/ copies
    APP_DIR = Path(sys.executable).resolve().parent  # where the .exe lives
else:
    BUNDLE_DIR = Path(__file__).resolve().parent.parent  # project root
    APP_DIR = BUNDLE_DIR

WEB_DIR = BUNDLE_DIR / "web"

# Répertoire de données : GOBLIN_DATA_DIR s'il est défini, sinon APP_DIR.
_DATA_DIR = os.environ.get("GOBLIN_DATA_DIR", "").strip()
DATA_DIR = Path(_DATA_DIR) if _DATA_DIR else APP_DIR
SETTINGS_PATH = DATA_DIR / "goblin-settings.json"
