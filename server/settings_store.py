"""Read/write app settings (LLM endpoint, key, model).

Stored as JSON next to the server package so a restart keeps user config.
Environment variables provide first-run defaults.
"""
import json
import os

from .paths import SETTINGS_PATH

DEFAULT_BASE_URL = os.environ.get("GOBLIN_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_API_KEY = os.environ.get("GOBLIN_API_KEY", "")
DEFAULT_MODEL = os.environ.get("GOBLIN_MODEL", "deepseek-chat")


def load() -> dict:
    data = {
        "base_url": DEFAULT_BASE_URL,
        "api_key": DEFAULT_API_KEY,
        "model": DEFAULT_MODEL,
    }
    if SETTINGS_PATH.exists():
        try:
            stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                data.update({k: v for k, v in stored.items() if k in data})
        except (json.JSONDecodeError, OSError):
            pass
    return data


def save(settings: dict) -> dict:
    current = load()
    for key in ("base_url", "api_key", "model"):
        if key in settings and settings[key] is not None:
            value = str(settings[key]).strip()
            if key == "api_key" and not value:
                continue
            current[key] = value
    SETTINGS_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current
