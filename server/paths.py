"""Resource paths that work both from source and inside a PyInstaller exe.

In a frozen one-file build, read-only bundle data lives under sys._MEIPASS
(a temp dir recreated on every launch), while writable user config must sit
next to the exe so it survives restarts.
"""
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
SETTINGS_PATH = APP_DIR / "goblin-settings.json"
