# Agentic BI Local Runtime

This is the local AI gateway for the existing Agentic BI System. It runs on the user's Windows computer and sends inference requests to Ollama on the same machine.

## Requirements

- Windows 11
- Python 3.11 or newer
- Ollama for Windows
- Recommended first model: `qwen3.5:4b`

## Setup (PowerShell)

From the repository root:

```powershell
cd agent-runtime
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

If PowerShell blocks activation, use `.venv\Scripts\python.exe` directly or run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that PowerShell window.

## Start the runtime

Keep Ollama running, then:

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open:

- Health: http://127.0.0.1:8000/health
- Installed models: http://127.0.0.1:8000/models
- Interactive API docs: http://127.0.0.1:8000/docs

The runtime deliberately binds to `127.0.0.1`, not `0.0.0.0`. Do not expose port 8000 or Ollama's port 11434 to the public internet.

## Endpoints

- `GET /health` — runtime and Ollama availability
- `GET /models` — locally installed Ollama models
- `POST /chat` — non-streaming local model response

Example request:

```json
{
  "message": "Explain the difference between a Power BI measure and a calculated column."
}
```

No OpenAI, Anthropic, or other hosted inference API is called. The model runs through the local Ollama service.

## Hardware profile

The initial configuration targets a Windows 11 laptop with an Intel Core i5-1335U, 16 GB DDR4 RAM, and Intel Iris Xe integrated graphics. Start with one 4B model and a 4K context. Use CPU inference as the dependable baseline; GPU acceleration is optional and must be verified on the machine.

## Vercel note

A Vercel-hosted frontend cannot run this Python process or access the laptop's GPU on the server. When the Vercel app is opened in a browser on this same laptop, the browser may connect to the local runtime at `127.0.0.1:8000`. Configure the exact Vercel origin in `AGENT_CORS_ORIGINS` only after local development works. Browser local-network permissions and HTTPS-to-localhost behaviour can vary by browser.

If the laptop is off, the cloud UI remains available but local inference is unavailable. This phase does not add a public tunnel or remote access.
