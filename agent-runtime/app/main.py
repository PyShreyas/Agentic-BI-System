import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Agentic BI Local Runtime"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))

app = FastAPI(
    title=APP_NAME,
    description="Local-only AI gateway for the Agentic BI System. No external AI API is used.",
    version="0.1.0",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "AGENT_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    model: Optional[str] = None
    system: Optional[str] = Field(default=None, max_length=4000)


def ollama_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=OLLAMA_BASE_URL,
        timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=3.0),
    )


async def get_ollama_tags() -> dict:
    async with ollama_client() as client:
        response = await client.get("/api/tags")
        response.raise_for_status()
        return response.json()


@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    try:
        tags = await get_ollama_tags()
        models = [item.get("name", "") for item in tags.get("models", [])]
        return {
            "status": "online",
            "runtime": "fastapi",
            "ollama": "connected",
            "default_model": DEFAULT_MODEL,
            "model_installed": DEFAULT_MODEL in models,
            "installed_models": models,
        }
    except (httpx.HTTPError, ValueError):
        return {
            "status": "degraded",
            "runtime": "fastapi",
            "ollama": "unavailable",
            "default_model": DEFAULT_MODEL,
            "model_installed": False,
            "installed_models": [],
            "message": "Start Ollama and ensure its local service is running.",
        }


@app.get("/models")
async def models():
    try:
        tags = await get_ollama_tags()
        return {
            "default_model": DEFAULT_MODEL,
            "models": [
                {
                    "name": item.get("name"),
                    "size": item.get("size"),
                    "modified_at": item.get("modified_at"),
                    "details": item.get("details", {}),
                }
                for item in tags.get("models", [])
            ],
        }
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail="Ollama is not reachable. Start Ollama and try again.",
        ) from exc


@app.post("/chat")
async def chat(request: ChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be blank.")

    model = request.model or DEFAULT_MODEL

    try:
        tags = await get_ollama_tags()
        installed_models = {
            item.get("name") for item in tags.get("models", [])
        }
        if model not in installed_models:
            raise HTTPException(
                status_code=400,
                detail=f"Model '{model}' is not installed. Pull it with: ollama pull {model}",
            )

        messages = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.append({"role": "user", "content": message})

        async with ollama_client() as client:
            response = await client.post(
                "/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "keep_alive": "5m",
                    "options": {
                        "temperature": 0.2,
                        "num_ctx": 4096,
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()

        result = payload.get("message", {}).get("content", "").strip()
        if not result:
            raise HTTPException(status_code=502, detail="Ollama returned an empty response.")

        eval_count = payload.get("eval_count", 0) or 0
        eval_duration = payload.get("eval_duration", 0) or 0
        tokens_per_second = (
            round(eval_count / (eval_duration / 1_000_000_000), 2)
            if eval_duration > 0
            else None
        )

        return {
            "content": result,
            "model": model,
            "done": payload.get("done", True),
            "tokens_per_second": tokens_per_second,
            "total_duration_ns": payload.get("total_duration"),
        }
    except HTTPException:
        raise
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama at 127.0.0.1:11434. Make sure Ollama is running.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned HTTP {exc.response.status_code}.",
        ) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="The local model took too long to respond. Try a shorter prompt or the 2B model.",
        ) from exc
