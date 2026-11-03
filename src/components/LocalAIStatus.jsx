import { useCallback, useEffect, useState } from "react";
import {
  getLocalAgentHealth,
  getLocalAgentModels,
  sendLocalAgentMessage,
} from "../services/localAgentClient";

export default function LocalAIStatus() {
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getLocalAgentHealth();
      setHealth(result);
      if (result.ollama === "connected") {
        const modelResult = await getLocalAgentModels();
        setModels(modelResult.models || []);
      } else {
        setModels([]);
      }
    } catch (err) {
      setHealth(null);
      setModels([]);
      setError(err.message || "Local AI runtime is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runTest = async () => {
    setTesting(true);
    setTestResult("");
    setError("");
    try {
      const result = await sendLocalAgentMessage(
        "Reply with exactly this sentence: Local Qwen model connection is working."
      );
      setTestResult(result.content);
    } catch (err) {
      setError(err.message || "The local model test failed.");
    } finally {
      setTesting(false);
    }
  };

  const online = health?.ollama === "connected";
  const installed = health?.model_installed;

  return (
    <section
      aria-live="polite"
      style={{
        border: "1px solid #DCE6F5",
        borderRadius: 10,
        padding: "12px 14px",
        background: "#F8FAFC",
        color: "#0F172A",
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Local AI Runtime</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#64748B" }}>
            {loading ? "Checking your local AI engine…" : online ? `Ollama connected · ${health.installed_models?.length || 0} model(s) installed` : "Local runtime not detected"}
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: loading ? "#64748B" : online ? "#15803D" : "#B45309",
          background: loading ? "#E2E8F0" : online ? "#DCFCE7" : "#FEF3C7",
          borderRadius: 20,
          padding: "5px 9px",
        }}>
          {loading ? "CHECKING" : online ? "CONNECTED" : "OFFLINE"}
        </span>
      </div>

      {online && (
        <div style={{ fontSize: 11, color: "#475569" }}>
          Default model: <strong>{health.default_model}</strong>
          {!installed && <span> · Model not installed yet</span>}
          {models.length > 0 && <span> · Available: {models.map(item => item.name).join(", ")}</span>}
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: "#B91C1C" }}>{error}</div>}
      {testResult && (
        <div style={{ padding: 9, borderRadius: 7, background: "#ECFDF5", color: "#166534", fontSize: 12 }}>
          <strong>Model test:</strong> {testResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={refresh} disabled={loading || testing} style={{ border: "1px solid #CBD5E1", borderRadius: 7, background: "#fff", padding: "7px 10px", fontSize: 11, cursor: "pointer" }}>
          Refresh status
        </button>
        <button type="button" onClick={runTest} disabled={!online || !installed || testing} style={{ border: "none", borderRadius: 7, background: online && installed ? "#072E55" : "#94A3B8", color: "#fff", padding: "7px 10px", fontSize: 11, cursor: online && installed ? "pointer" : "not-allowed" }}>
          {testing ? "Testing model…" : "Test local model"}
        </button>
      </div>
    </section>
  );
}
