"""Resource paths that work both from source and inside a PyInstaller exe.

In a frozen one-file build, read-only bundle data lives under sys._MEIPASS
(a temp dir recreated on every launch), while writable user config must sit
outside the application directory so it survives a reinstallation or a new
session.

Le répertoire de données (config + persistance) est configurable via
GOBLIN_DATA_DIR. Par défaut il pointe vers un répertoire utilisateur persistant
hors de l'application, afin que les réglages soient retrouvés après une
réinstallation ou une nouvelle session.
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

def default_data_dir() -> Path:
    """Répertoire de données utilisateur persistant, hors du répertoire de l'appli.

    - Windows : %APPDATA%/Goblin Tools
    - macOS   : ~/Library/Application Support/Goblin Tools
    - Linux   : $XDG_DATA_HOME/goblin-tools (défaut ~/.local/share/goblin-tools)
    """
    home = Path.home()
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA", home)) / "Goblin Tools"
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "Goblin Tools"
    xdg = os.environ.get("XDG_DATA_HOME", "").strip()
    base = Path(xdg) if xdg else home / ".local" / "share"
    return base / "goblin-tools"


# Répertoire de données : GOBLIN_DATA_DIR s'il est défini, sinon un répertoire
# utilisateur persistant hors de l'application (survit à la réinstallation).
_DATA_DIR = os.environ.get("GOBLIN_DATA_DIR", "").strip()
DATA_DIR = Path(_DATA_DIR) if _DATA_DIR else default_data_dir()
SETTINGS_PATH = DATA_DIR / "goblin-settings.json"
