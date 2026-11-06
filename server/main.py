"""FastAPI entry point: serves the web SPA and the /api tool endpoints."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import llm, local_ai, settings_store, tools
from .paths import WEB_DIR

app = FastAPI(title="Goblin Tools Local")

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
        if path == "/api/settings" and request.method == "GET":
            pass  # masque la clé, pas de secret exposé
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
    }


@app.put("/api/settings")
async def put_settings(data: dict):
    saved = settings_store.save(data)
    key = saved.get("api_key", "")
    return {"ok": True, "model": saved["model"], "base_url": saved["base_url"], "has_key": bool(key)}


@app.post("/api/settings/test")
async def test_settings():
    reply = await llm.chat("Tu es un assistant de test.", "Réponds par un seul mot : oui", temperature=0)
    return {"ok": True, "reply": reply.strip()[:50]}


@app.get("/api/health")
async def health():
    status = await llm.health(settings_store.load())
    return status


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


app.mount("/", FreshStaticFiles(directory=WEB_DIR), name="static")
