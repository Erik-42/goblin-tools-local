"""Read/write app settings (LLM endpoint, key, model, deployment mode).

Stored as JSON next to the server package so a restart keeps user config.
Environment variables provide first-run defaults. Secrets (api_key, auth_token)
sont stockés sur la machine et ne doivent jamais être versionnés
(.gitignore / .env.example).
"""
import json
import os

from .paths import SETTINGS_PATH


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


DEFAULT_BASE_URL = _env("GOBLIN_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_API_KEY = _env("GOBLIN_API_KEY", "")
DEFAULT_MODEL = _env("GOBLIN_MODEL", "deepseek-chat")

# Déploiement dual LOCAL / SERVEUR
DEFAULT_MODE = _env("GOBLIN_MODE", "server")          # local | server
DEFAULT_HOST = _env("GOBLIN_HOST", "127.0.0.1")
DEFAULT_PORT = int(_env("GOBLIN_PORT", "8765"))
DEFAULT_DATA_DIR = _env("GOBLIN_DATA_DIR", "")
DEFAULT_AUTH_TOKEN = _env("GOBLIN_AUTH_TOKEN", "")
DEFAULT_CORS_ORIGINS = _env("GOBLIN_CORS_ORIGINS", "")

# Fournisseur IA
DEFAULT_AI_MODE = _env("GOBLIN_AI_MODE", "auto")       # distant | local | auto

# Clés persistables. port est converti en int à la lecture.
_SETTING_KEYS = (
    "base_url", "api_key", "model",
    "mode", "host", "port", "data_dir", "auth_token", "cors_origins",
    "ai_mode",
)


def load() -> dict:
    data = {
        "base_url": DEFAULT_BASE_URL,
        "api_key": DEFAULT_API_KEY,
        "model": DEFAULT_MODEL,
        "mode": DEFAULT_MODE,
        "host": DEFAULT_HOST,
        "port": DEFAULT_PORT,
        "data_dir": DEFAULT_DATA_DIR,
        "auth_token": DEFAULT_AUTH_TOKEN,
        "cors_origins": DEFAULT_CORS_ORIGINS,
        "ai_mode": DEFAULT_AI_MODE,
    }
    if SETTINGS_PATH.exists():
        try:
            stored = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                data.update({k: v for k, v in stored.items() if k in data})
        except (json.JSONDecodeError, OSError):
            pass
    # Normalisation des types
    try:
        data["port"] = int(data.get("port") or DEFAULT_PORT)
    except (TypeError, ValueError):
        data["port"] = DEFAULT_PORT
    return data


def save(settings: dict) -> dict:
    current = load()
    for key in _SETTING_KEYS:
        if key in settings and settings[key] is not None:
            value = settings[key]
            if key in ("api_key", "auth_token") and not str(value).strip():
                continue  # ne pas écraser une clé vide
            if key == "port":
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    continue
            current[key] = value
    SETTINGS_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current
