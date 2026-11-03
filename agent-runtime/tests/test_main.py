import httpx
import pytest
from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeOllamaClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, path, json):
        assert path == "/api/chat"
        assert json["stream"] is False
        return FakeResponse(
            {
                "message": {"content": "A Power BI measure is calculated at query time."},
                "done": True,
                "eval_count": 12,
                "eval_duration": 1_000_000_000,
                "total_duration": 2_000_000_000,
            }
        )


def test_root_returns_runtime_information():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["status"] == "running"
    assert response.json()["health"] == "/health"


def test_health_reports_connected_ollama_and_installed_default_model(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_ollama_tags",
        _async_return({"models": [{"name": main.DEFAULT_MODEL}]}),
    )

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["ollama"] == "connected"
    assert response.json()["model_installed"] is True


def test_health_reports_degraded_when_ollama_is_unavailable(monkeypatch):
    async def unavailable():
        raise httpx.ConnectError("Ollama unavailable")

    monkeypatch.setattr(main, "get_ollama_tags", unavailable)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["ollama"] == "unavailable"


def test_models_returns_installed_models(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_ollama_tags",
        _async_return({"models": [{"name": "qwen-test:latest", "size": 123}]}),
    )

    response = client.get("/models")

    assert response.status_code == 200
    assert response.json()["models"][0]["name"] == "qwen-test:latest"


def test_models_returns_service_unavailable_when_ollama_is_down(monkeypatch):
    async def unavailable():
        raise httpx.ConnectError("Ollama unavailable")

    monkeypatch.setattr(main, "get_ollama_tags", unavailable)

    response = client.get("/models")

    assert response.status_code == 503


def test_chat_rejects_a_model_that_is_not_installed(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_ollama_tags",
        _async_return({"models": []}),
    )

    response = client.post(
        "/chat",
        json={"message": "Explain a Power BI measure.", "model": "missing:model"},
    )

    assert response.status_code == 400
    assert "not installed" in response.json()["detail"]


def test_chat_rejects_a_whitespace_only_message():
    response = client.post("/chat", json={"message": "   "})

    assert response.status_code == 422
    assert response.json()["detail"] == "Message cannot be blank."


def test_chat_returns_the_local_model_response(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_ollama_tags",
        _async_return({"models": [{"name": main.DEFAULT_MODEL}]}),
    )
    monkeypatch.setattr(main, "ollama_client", FakeOllamaClient)

    response = client.post("/chat", json={"message": "Explain a Power BI measure."})

    assert response.status_code == 200
    assert response.json()["content"].startswith("A Power BI measure")
    assert response.json()["model"] == main.DEFAULT_MODEL
    assert response.json()["tokens_per_second"] == 12.0


def _async_return(value):
    async def result():
        return value

    return result
