const LOCAL_AGENT_URL = (
  import.meta.env.VITE_LOCAL_AGENT_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${LOCAL_AGENT_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || `Local AI request failed (${response.status}).`);
  }
  return payload;
}

export function getLocalAgentHealth() {
  return request("/health");
}

export function getLocalAgentModels() {
  return request("/models");
}

export function sendLocalAgentMessage(message, model) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ message, ...(model ? { model } : {}) }),
  });
}

export { LOCAL_AGENT_URL };
