# Phase 1 — Local AI Foundation

This phase adds a local Ollama gateway and connects the existing Ask My BI page to its health/model test panel. The current deterministic Task, Report, My Day, QA, and Documentation logic remains in place.

## Hardware target

- Intel Core i5-1335U
- 16 GB DDR4 RAM
- Intel Iris Xe integrated graphics
- Windows 11

Use CPU inference as the baseline. Keep only one generation model loaded while testing and start with a 4K context.

## 1. Install Ollama and pull the initial models

Install Ollama for Windows from the official Ollama website. Open PowerShell after installation:

```powershell
ollama --version
ollama pull qwen3.5:4b
ollama pull qwen3.5:2b
ollama pull nomic-embed-text
ollama list
```

Start a model test:

```powershell
ollama run qwen3.5:4b
```

Ask it a short BI question, then exit the chat with `/bye`.

## 2. Start the local FastAPI gateway

Open a second PowerShell window at the repository root:

```powershell
cd agent-runtime
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file .env --reload
```

If activation is blocked by PowerShell policy, run this for the current terminal only, then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

Verify these URLs:

- http://127.0.0.1:8000/health
- http://127.0.0.1:8000/models
- http://127.0.0.1:8000/docs

Expected health response includes `"status": "online"`, `"ollama": "connected"`, and `"model_installed": true`.

## 3. Start the existing React application

Open a third PowerShell window at the repository root:

```powershell
npm install
npm run dev
```

Open the Vite URL (normally http://localhost:5173), navigate to Ask My BI, and locate the **Local AI Runtime** panel.

- Select **Refresh status** to check the backend and installed models.
- Select **Test local model** to send a small prompt through FastAPI to Ollama.

The existing deterministic Ask My BI commands continue to work independently. This panel verifies the new local model connection; it does not yet replace the deterministic orchestrator.

## 4. Optional: use the Vercel-hosted frontend on this same laptop

First confirm that the local Vite app works. Then edit `agent-runtime/.env` and add the exact deployed Vercel origin to `AGENT_CORS_ORIGINS`, separated by a comma. Do not use a wildcard origin.

Restart FastAPI after changing the environment file. Open the deployed Vercel app in a browser on the same laptop and test the Local AI Runtime panel.

Browser policies for HTTPS pages connecting to loopback services can vary. The browser may ask permission for local network access. If the request is blocked, continue using the local Vite frontend for Phase 1; a secure local companion/desktop bridge can be designed in a later phase.

## Safety and privacy

- FastAPI binds to `127.0.0.1` only. Do not change it to `0.0.0.0`.
- Do not expose ports 8000 or 11434 to the internet or your LAN.
- Do not add company/client data to prompts or the local knowledge base unless you are authorised to process it on this device.
- This initial gateway only provides health, model listing, and local text generation. It does not connect to SQL Server, Firestore write operations, or production systems.
- The legacy `api/ai.js` file is not used by this local gateway. It is retained for now so this phase does not remove existing project files.

## Troubleshooting

**Ollama is unavailable**

- Confirm the Ollama application is running.
- Run `ollama list`.
- Open http://127.0.0.1:11434/api/tags in a browser.

**The default model is not installed**

```powershell
ollama pull qwen3.5:4b
```

**FastAPI cannot start**

- Confirm Python 3.11 is installed: `py -3.11 --version`.
- Re-activate the virtual environment.
- Reinstall dependencies: `pip install -r requirements.txt`.

**The React panel reports a network/CORS error**

- Confirm FastAPI is running on port 8000.
- Confirm the frontend origin exactly matches an entry in `AGENT_CORS_ORIGINS`.
- Restart FastAPI after changing `.env`.
- For local development, use the Vite URL listed in the terminal.

## Phase 1 completion checklist

- [ ] Ollama installed
- [ ] Qwen 4B downloaded
- [ ] `/health` reports Ollama connected
- [ ] `/models` lists Qwen 4B
- [ ] Ask My BI shows Local AI Runtime as connected
- [ ] Test local model returns a response
- [ ] Existing tracker pages still work
