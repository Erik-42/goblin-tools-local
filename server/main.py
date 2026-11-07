"""FastAPI entry point: serves the web SPA and the /api tool endpoints."""
import httpx

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, assistant, llm, local_ai, prefs, settings_store, tools
from . import data_store
from .local_llm.manager import get_manager
from .paths import WEB_DIR, BUNDLE_DIR

app = FastAPI(title="Une Étape à la Fois", version=__version__)

# ----------------------------------------------------------------- CORS
_settings = settings_store.load()
_origins = [o.strip() for o in str(_settings.get("cors_origins") or "").split(",") if o.strip()]
if not _origins:
    _origins = ["*"] if _settings.get("mode") != "server" else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------- auth
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    settings = settings_store.load()
    token = settings.get("auth_token")
    path = request.url.path
    if token and path.startswith("/api/") and path != "/api/health":
        # Les réglages (lecture, écriture, test de connexion, liste des modèles)
        # restent accessibles sans jeton : c'est depuis cette page que le jeton
        # se configure. Le jeton protège les appels outils / assistant, pas la
        # page de configuration.
        if path == "/api/settings" or path == "/api/settings/test" or path == "/api/models":
            pass
        else:
            auth = request.headers.get("authorization", "")
            if auth != f"Bearer {token}":
                return JSONResponse(status_code=401, content={"detail": "Non autorisé"})
    response = await call_next(request)
    return response


@app.exception_handler(llm.LLMNotConfigured)
async def not_configured_handler(request: Request, exc: llm.LLMNotConfigured):
    return JSONResponse(status_code=400, content={"detail": str(exc), "code": "not_configured"})


@app.exception_handler(llm.LLMError)
async def llm_error_handler(request: Request, exc: llm.LLMError):
    return JSONResponse(status_code=502, content={"detail": str(exc), "code": "llm_error"})


# ----------------------------------------------------------------- settings
@app.get("/api/settings")
async def get_settings():
    s = settings_store.load()
    resolved = local_ai.resolve(s)
    key = resolved.get("api_key") or s.get("api_key", "")
    masked = (key[:4] + "…" + key[-4:]) if len(key) > 12 else ("définie" if key else "")
    return {
        "base_url": resolved["base_url"],
        "model": resolved["model"],
        "api_key_masked": masked,
        "has_key": bool(key),
        "source": resolved.get("source", "settings"),
        "primary": resolved.get("primary") or resolved["model"],
        "fallback": resolved.get("fallback") or "",
        "loaded": resolved.get("loaded") or "",
        "mode": s.get("mode"),
        "host": s.get("host"),
        "port": s.get("port"),
        "data_dir": s.get("data_dir"),
        "auth_token_set": bool(s.get("auth_token")),
        "cors_origins": s.get("cors_origins") or "",
        "ai_mode": s.get("ai_mode"),
        "provider": s.get("provider"),
    }


@app.get("/api/models")
async def list_models():
    """Liste les modèles disponibles chez le fournisseur configuré."""
    s = settings_store.load()
    if s.get("provider") == "local":
        model = s.get("model") or llm.LOCAL_ENGINE_MODEL
        manager = get_manager()
        models = [model] if manager.status().get("model_present") else []
        return {"models": models, "current": model}
    endpoint = local_ai.resolve(s)
    base = str(endpoint.get("base_url") or "").rstrip("/")
    models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            if local_ai.is_local_endpoint(base):
                url = base.replace("/v1", "") + "/api/tags"
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [str(m.get("name")) for m in (data.get("models") or []) if m.get("name")]
            else:
                resp = await client.get(base + "/models")
                if resp.status_code == 200:
                    data = resp.json()
                    models = [str(m.get("id")) for m in (data.get("data") or []) if m.get("id")]
    except Exception:
        pass
    current = s.get("model") or endpoint.get("model") or ""
    if current and current not in models:
        models.insert(0, current)
    return {"models": models, "current": current}


@app.put("/api/settings")
async def put_settings(data: dict):
    saved = settings_store.save(data)
    key = saved.get("api_key", "")
    return {"ok": True, "model": saved["model"], "base_url": saved["base_url"], "has_key": bool(key)}


@app.post("/api/settings/test")
async def test_settings():
    reply = await llm.chat("Tu es un assistant de test.", "Réponds par un seul mot : oui", temperature=0)
    return {"ok": True, "reply": reply.strip()[:50]}


@app.post("/api/assistant/chat")
async def assistant_chat(data: dict):
    message = str(data.get("message", "")).strip()
    if not message:
        return JSONResponse(status_code=400, content={"detail": "Message vide"})
    history = data.get("history") or []
    if not isinstance(history, list):
        history = []
    return await assistant.assistant_chat(message, history)


@app.get("/api/health")
async def health():
    status = await llm.health(settings_store.load())
    return status


# ----------------------------------------------------------------- local LLM
@app.get("/api/local/status")
async def local_status():
    manager = get_manager()
    return manager.status()


@app.post("/api/local/install")
async def local_install():
    manager = get_manager()
    return manager.install()


@app.post("/api/local/retry")
async def local_retry():
    manager = get_manager()
    return manager.retry()


# ----------------------------------------------------------------- preferences
@app.get("/api/prefs")
async def get_prefs():
    return prefs.get_all()


@app.put("/api/prefs")
async def put_prefs(data: dict):
    if not isinstance(data, dict):
        return JSONResponse(status_code=400, content={"detail": "Corps attendu : objet de paires cle/valeur"})
    for key, value in data.items():
        prefs.set(str(key), str(value))
    return {"ok": True}


@app.get("/api/prefs/{key}")
async def get_pref(key: str):
    value = prefs.get(key)
    if value is None:
        return JSONResponse(status_code=404, content={"detail": "Preference inconnue"})
    return {"key": key, "value": value}


@app.put("/api/prefs/{key}")
async def put_pref(key: str, data: dict):
    value = data.get("value") if isinstance(data, dict) else None
    if value is None:
        return JSONResponse(status_code=400, content={"detail": "Champ 'value' requis"})
    prefs.set(key, str(value))
    return {"ok": True}


@app.delete("/api/prefs/{key}")
async def delete_pref(key: str):
    prefs.delete(key)
    return {"ok": True}


# ----------------------------------------------------------------- donnees persistees
# historique
@app.get("/api/data/history")
async def data_history():
    return {"history": data_store.get_store().get_history()}


@app.post("/api/data/history")
async def data_add_history(data: dict):
    store = data_store.get_store()
    store.add_history(
        str(data.get("tool", "")),
        str(data.get("input", "")),
        data.get("output", {}),
        float(data.get("time") or 0),
    )
    return {"ok": True}


@app.delete("/api/data/history")
async def data_clear_history():
    data_store.get_store().clear_history()
    return {"ok": True}


# listes Magic ToDo
@app.get("/api/data/lists")
async def data_lists():
    return {"lists": data_store.get_store().get_lists()}


@app.get("/api/data/lists/{list_id}")
async def data_list(list_id: int):
    row = data_store.get_store().get_list(list_id)
    if row is None:
        return JSONResponse(status_code=404, content={"detail": "Liste inconnue"})
    return row


@app.post("/api/data/lists")
async def data_save_list(data: dict):
    store = data_store.get_store()
    list_id = store.save_list(
        data.get("id"),
        str(data.get("name", "")),
        data.get("steps", []),
        float(data.get("created") or 0),
    )
    return {"ok": True, "id": list_id}


@app.delete("/api/data/lists/{list_id}")
async def data_delete_list(list_id: int):
    data_store.get_store().delete_list(list_id)
    return {"ok": True}


# sessions assistant
@app.get("/api/data/sessions")
async def data_sessions():
    return {"sessions": data_store.get_store().get_sessions()}


@app.get("/api/data/sessions/{session_id}")
async def data_session(session_id: str):
    row = data_store.get_store().get_session(session_id)
    if row is None:
        return JSONResponse(status_code=404, content={"detail": "Session inconnue"})
    return row


@app.post("/api/data/sessions/{session_id}")
async def data_save_session(session_id: str, data: dict):
    store = data_store.get_store()
    store.save_session(
        session_id,
        str(data.get("name", "")),
        data.get("messages", []),
        float(data.get("updated") or 0),
    )
    return {"ok": True}


@app.delete("/api/data/sessions/{session_id}")
async def data_delete_session(session_id: str):
    data_store.get_store().delete_session(session_id)
    return {"ok": True}


@app.get("/api/data/current-session")
async def data_current_session():
    return {"id": data_store.get_store().get_current_session()}


@app.post("/api/data/current-session")
async def data_set_current_session(data: dict):
    data_store.get_store().set_current_session(data.get("id"))
    return {"ok": True}


# focus Taskmaster
@app.get("/api/data/focus")
async def data_focus():
    return data_store.get_store().get_focus() or {}


@app.post("/api/data/focus")
async def data_save_focus(data: dict):
    data_store.get_store().save_focus(
        data.get("list_id"),
        int(data.get("idx") or 0),
        int(data.get("done") or 0),
        int(data.get("skipped") or 0),
    )
    return {"ok": True}


@app.delete("/api/data/focus")
async def data_clear_focus():
    data_store.get_store().clear_focus()
    return {"ok": True}


@app.get("/api/version")
async def version():
    return {"version": __version__}


# --------------------------------------------------------------------- tools
@app.post("/api/{tool_name}")
async def run_tool(tool_name: str, request: Request):
    handler = tools.TOOLS.get(tool_name)
    if handler is None:
        return JSONResponse(status_code=404, content={"detail": f"Outil inconnu : {tool_name}"})
    try:
        data = await request.json()
    except Exception:
        data = {}
    try:
        result = await handler(data if isinstance(data, dict) else {})
    except ValueError as exc:  # input validation
        return JSONResponse(status_code=400, content={"detail": str(exc), "code": "bad_input"})
    return result


class FreshStaticFiles(StaticFiles):
    """The taskbar launcher keeps a Chromium profile. Never let it reuse an old page."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response


# --------------------------------------------------------------------- SPA
@app.get("/")
async def index():
    return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/assets", StaticFiles(directory=BUNDLE_DIR / "assets"), name="assets")


app.mount("/", FreshStaticFiles(directory=WEB_DIR), name="static")
