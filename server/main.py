"""FastAPI entry point: serves the web SPA and the /api tool endpoints."""
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import llm, settings_store, tools
from .paths import WEB_DIR

app = FastAPI(title="Goblin Tools Local")


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
    key = s.get("api_key", "")
    masked = (key[:4] + "…" + key[-4:]) if len(key) > 12 else ("已设置" if key else "")
    return {
        "base_url": s["base_url"],
        "model": s["model"],
        "api_key_masked": masked,
        "has_key": bool(key),
    }


@app.put("/api/settings")
async def put_settings(data: dict):
    saved = settings_store.save(data)
    key = saved.get("api_key", "")
    return {"ok": True, "model": saved["model"], "base_url": saved["base_url"], "has_key": bool(key)}


@app.post("/api/settings/test")
async def test_settings():
    reply = await llm.chat("你是一个测试助手。", "回复一个字：好", temperature=0)
    return {"ok": True, "reply": reply.strip()[:50]}


# --------------------------------------------------------------------- tools
@app.post("/api/{tool_name}")
async def run_tool(tool_name: str, request: Request):
    handler = tools.TOOLS.get(tool_name)
    if handler is None:
        return JSONResponse(status_code=404, content={"detail": f"未知工具：{tool_name}"})
    try:
        data = await request.json()
    except Exception:
        data = {}
    try:
        result = await handler(data if isinstance(data, dict) else {})
    except ValueError as exc:  # input validation
        return JSONResponse(status_code=400, content={"detail": str(exc), "code": "bad_input"})
    return result


# --------------------------------------------------------------------- SPA
@app.get("/")
async def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/", StaticFiles(directory=WEB_DIR), name="static")
