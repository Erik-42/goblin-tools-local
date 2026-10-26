"""Thin async client for any OpenAI-compatible chat-completions endpoint."""
import asyncio
import json
import re

import httpx

from . import local_ai, settings_store


class LLMNotConfigured(Exception):
    """No API key set — the UI should route the user to Settings."""


class LLMError(Exception):
    """Upstream call failed or the reply could not be parsed."""


def _is_ollama(base: str) -> bool:
    return "127.0.0.1:11434" in base or "localhost:11434" in base


async def _post_ollama(endpoint: dict, system: str, user: str, temperature: float, want_json: bool) -> str:
    """API native Ollama : respect de think=false (contrairement à /v1)."""
    # Sur petit GPU Vulkan, une température basse + budget tokens réduit évite les OOM.
    temp = min(float(temperature), 0.3)
    payload = {
        "model": endpoint["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "think": False,
        "options": {
            "temperature": temp,
            "num_ctx": 1024,
            "num_predict": 256 if want_json else 384,
            # Quadro M2000M via Vulkan : OOM fréquents → CPU plus lent mais stable.
            "num_gpu": 0,
        },
    }
    url = "http://127.0.0.1:11434/api/chat"
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, json=payload)
    except httpx.TimeoutException as exc:
        raise LLMError(f"Ollama n'a pas répondu à temps ({endpoint.get('model')}).") from exc
    except httpx.HTTPError as exc:
        raise LLMError(f"Impossible de joindre Ollama : {exc or type(exc).__name__}") from exc

    if resp.status_code != 200:
        raise LLMError(f"Ollama a répondu {resp.status_code} : {resp.text[:300]}")

    try:
        data = resp.json()
        message = data.get("message") or {}
        content = message.get("content") or ""
        if not content.strip():
            content = message.get("thinking") or ""
    except (ValueError, TypeError) as exc:
        raise LLMError(f"Format de réponse Ollama inattendu : {resp.text[:300]}") from exc

    text = (content or "").strip()
    # Runner mort / réponse fantôme (done=false) : une seule relance à froid.
    if (not text and not data.get("done", True)) or (not text and not data.get("model")):
        raise LLMError(f"Le runner Ollama est indisponible pour {endpoint.get('model')}.")
    if not text:
        raise LLMError(f"Le modèle {endpoint.get('model')} a renvoyé une réponse vide.")
    return text


async def _post_ollama_with_retry(endpoint: dict, system: str, user: str, temperature: float, want_json: bool) -> str:
    try:
        return await _post_ollama(endpoint, system, user, temperature, want_json)
    except LLMError as exc:
        if "indisponible" not in str(exc) and "réponse vide" not in str(exc):
            raise
        # Courte pause puis un seul nouvel essai (runner Vulkan parfois instable).
        await asyncio.sleep(1.5)
        return await _post_ollama(endpoint, system, user, temperature, want_json)


async def _post_openai(endpoint: dict, system: str, user: str, temperature: float, want_json: bool) -> str:
    api_key = endpoint.get("api_key") or ""
    if not api_key:
        raise LLMNotConfigured(
            "Aucune clé API. Ouvre « Réglages » et renseigne l'URL de base, la clé API et le nom du modèle."
        )

    base = str(endpoint["base_url"]).rstrip("/")
    url = f"{base}/chat/completions"
    system_content = system
    if want_json:
        system_content = system + "\nRéponds uniquement avec un objet JSON valide, sans texte autour."

    payload = {
        "model": endpoint["model"],
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise LLMError(f"Impossible de joindre l'API du modèle : {exc}") from exc

    if resp.status_code != 200:
        raise LLMError(f"L'API du modèle a répondu {resp.status_code} : {resp.text[:300]}")

    try:
        data = resp.json()
        message = data["choices"][0]["message"]
        content = message.get("content") or ""
        if not content.strip():
            content = message.get("reasoning") or message.get("thinking") or ""
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Format de réponse inattendu : {resp.text[:300]}") from exc

    text = (content or "").strip()
    if not text:
        raise LLMError(f"Le modèle {endpoint.get('model')} a renvoyé une réponse vide.")
    return text


async def _post(endpoint: dict, system: str, user: str, temperature: float, want_json: bool) -> str:
    base = str(endpoint.get("base_url") or "").rstrip("/")
    if _is_ollama(base) or endpoint.get("source") in {"ia-choix", "ollama"}:
        return await _post_ollama_with_retry(endpoint, system, user, temperature, want_json)
    return await _post_openai(endpoint, system, user, temperature, want_json)


async def chat(system: str, user: str, temperature: float = 0.7, want_json: bool = False) -> str:
    settings = settings_store.load()
    endpoint = local_ai.resolve(settings)
    if not (endpoint.get("api_key") or settings.get("api_key")) and not _is_ollama(
        str(endpoint.get("base_url") or "")
    ):
        raise LLMNotConfigured(
            "Aucune clé API. Ouvre « Réglages » et renseigne l'URL de base, la clé API et le nom du modèle."
        )

    models = []
    for candidate in [endpoint["model"], *(endpoint.get("alternates") or []), endpoint.get("fallback")]:
        if candidate and candidate not in models:
            models.append(candidate)

    errors = []
    for model in models:
        try:
            return await _post({**endpoint, "model": model}, system, user, temperature, want_json)
        except LLMError as exc:
            errors.append(f"{model}: {exc}")
            continue
    raise LLMError(" ; ".join(errors) if errors else "Aucun modèle local n'a répondu.")


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json(text: str):
    """Best-effort extraction of a JSON object/array from model output."""
    text = (text or "").strip()
    if not text:
        raise LLMError("Le modèle a renvoyé une réponse vide.")
    candidates = [text]
    block = _JSON_BLOCK.search(text)
    if block:
        candidates.insert(0, block.group(1).strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.insert(1, text[start : end + 1])
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise LLMError("Le modèle n'a pas renvoyé de JSON. Réessaie ou change de modèle. Sortie brute : " + text[:200])
