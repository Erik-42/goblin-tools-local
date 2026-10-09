"""Thin async client for any OpenAI-compatible chat-completions endpoint."""
import json
import re

import httpx

from . import settings_store


class LLMNotConfigured(Exception):
    """No API key set — the UI should route the user to Settings."""


class LLMError(Exception):
    """Upstream call failed or the reply could not be parsed."""


async def chat(system: str, user: str, temperature: float = 0.7) -> str:
    settings = settings_store.load()
    api_key = settings.get("api_key", "")
    if not api_key:
        raise LLMNotConfigured("尚未配置 API Key，请打开「设置」填入 Base URL、API Key 和模型名。")

    base = settings["base_url"].rstrip("/")
    url = f"{base}/chat/completions"
    payload = {
        "model": settings["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise LLMError(f"无法连接到模型接口：{exc}") from exc

    if resp.status_code != 200:
        raise LLMError(f"模型接口返回 {resp.status_code}：{resp.text[:300]}")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError) as exc:
        raise LLMError(f"模型返回格式异常：{str(data)[:300]}") from exc
    return content or ""


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json(text: str):
    """Best-effort extraction of a JSON object/array from model output."""
    text = text.strip()
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
    raise LLMError("模型没有按要求返回 JSON，请重试或更换模型。原始输出：" + text[:200])
