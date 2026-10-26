"""Résout l'endpoint local à partir du choix ia-choix / Ollama."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.request import urlopen

CONF = Path.home() / ".config/cursor-fallback"
OLLAMA_BASE = "http://127.0.0.1:11434"
OLLAMA_V1 = f"{OLLAMA_BASE}/v1"
DEFAULT_MODEL = "qwen2.5-coder:7b"
DEFAULT_FALLBACK = "deepseek-coder:6.7b"


def _read(name: str, default: str = "") -> str:
    path = CONF / name
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return default
    return text or default


def loaded_model() -> str:
    try:
        with urlopen(f"{OLLAMA_BASE}/api/ps", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return ""
    models = data.get("models") or []
    if not models:
        return ""
    name = models[0].get("name") or models[0].get("model") or ""
    return str(name).strip()


def resolve(settings: dict) -> dict:
    """Ollama : modèle en mémoire en priorité, sinon celui choisi dans ia-choix.

    Si un modèle est déjà chargé, on ne propose pas de secours : un swap
    (ex. Nemotron → Qwen) sature la VRAM du Quadro et bloque Ollama.
    """
    mode = _read("mode", "subscription")
    base = str(settings.get("base_url") or "").rstrip("/")
    local = mode == "ollama" or "127.0.0.1:11434" in base or "localhost:11434" in base
    if not local:
        return {
            "base_url": settings.get("base_url") or OLLAMA_V1,
            "api_key": settings.get("api_key") or "",
            "model": settings.get("model") or DEFAULT_MODEL,
            "fallback": "",
            "alternates": [],
            "source": "settings",
        }

    primary = _read("ollama-model", DEFAULT_MODEL)
    fallback = _read("ollama-fallback", DEFAULT_FALLBACK)
    loaded = loaded_model()

    if loaded:
        model = loaded
        alts: list[str] = []
    else:
        model = primary or settings.get("model") or DEFAULT_MODEL
        alts = [fallback] if fallback and fallback != model else []

    return {
        "base_url": OLLAMA_V1,
        "api_key": settings.get("api_key") or "ollama",
        "model": model,
        "fallback": alts[0] if alts else "",
        "alternates": alts,
        "source": "ia-choix" if mode == "ollama" else "ollama",
        "loaded": loaded,
        "primary": primary,
    }
