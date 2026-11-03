import { useState } from "react";
import { validateReadOnlySql } from "./sqlValidator";

const examples = {
  safe: "SELECT TOP (100)\n    Vessel_Name, COUNT(*) AS PurchaseOrderCount\nFROM dbo.PurchaseOrders\nWHERE Created_Date >= '2026-01-01'\nGROUP BY Vessel_Name\nORDER BY PurchaseOrderCount DESC;",
  blocked: "SELECT * FROM dbo.PurchaseOrders; DELETE FROM dbo.PurchaseOrders;"
};

export default function SQLQueryValidator({ C }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 9, padding: 13 };
  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "12px/1.6 monospace" };
  const runValidation = () => setResult(validateReadOnlySql(query));
  const statusColor = result?.status === "blocked" ? "#D64550" : result?.status === "review" ? "#D97706" : "#0D9B3A";

  return (
    <div style={{ display: "grid", gap: 13 }}>
      <div style={panel}>
        <strong style={{ fontSize: 14 }}>SQL Server · Read-only validation</strong>
        <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>Run a static preflight against a query before it is considered for execution. The validator ignores comments and quoted strings when scanning operation keywords, and flags common risky patterns.</p>
        <textarea value={query} onChange={event => { setQuery(event.target.value); setResult(null); }} rows={12} spellCheck={false} placeholder="Paste a SELECT statement or read-only CTE..." style={{ ...fieldStyle, marginTop: 8 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
          <button onClick={runValidation} style={{ border: 0, borderRadius: 7, padding: "9px 13px", background: C.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Validate query</button>
          <button onClick={() => { setQuery(examples.safe); setResult(null); }} style={{ border: "1px solid " + C.border, borderRadius: 7, padding: "9px 12px", background: C.surface, color: C.text, cursor: "pointer" }}>Load safe example</button>
          <button onClick={() => { setQuery(examples.blocked); setResult(null); }} style={{ border: "1px solid " + C.border, borderRadius: 7, padding: "9px 12px", background: C.surface, color: C.text, cursor: "pointer" }}>Load blocked example</button>
          <button onClick={() => { setQuery(""); setResult(null); }} style={{ border: "1px solid " + C.border, borderRadius: 7, padding: "9px 12px", background: C.surface, color: C.text, cursor: "pointer" }}>Clear</button>
        </div>
      </div>
      {result && <div style={{ ...panel, borderLeft: "4px solid " + statusColor }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <strong style={{ fontSize: 14 }}>Validation result</strong>
          <span style={{ marginLeft: "auto", borderRadius: 20, padding: "4px 9px", background: statusColor + "18", color: statusColor, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{result.status === "passed" ? "Preflight passed" : result.status === "review" ? "Review recommended" : "Blocked"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}>
          {result.checks.map(check => <div key={check.label} style={{ display: "flex", gap: 7, alignItems: "center", padding: 9, borderRadius: 7, background: C.surface }}>
            <span style={{ color: check.passed ? "#0D9B3A" : "#D64550", fontWeight: 800 }}>{check.passed ? "✓" : "!"}</span><span style={{ fontSize: 11 }}>{check.label}</span>
          </div>)}
        </div>
        {result.blockers.length > 0 && <div style={{ marginTop: 12 }}><strong style={{ color: "#D64550", fontSize: 12 }}>Blocking findings</strong><ul style={{ margin: "6px 0 0", paddingLeft: 20, color: C.text, fontSize: 12, lineHeight: 1.7 }}>{result.blockers.map(item => <li key={item}>{item}</li>)}</ul></div>}
        {result.warnings.length > 0 && <div style={{ marginTop: 12 }}><strong style={{ color: "#D97706", fontSize: 12 }}>Review warnings</strong><ul style={{ margin: "6px 0 0", paddingLeft: 20, color: C.text, fontSize: 12, lineHeight: 1.7 }}>{result.warnings.map(item => <li key={item}>{item}</li>)}</ul></div>}
        {result.blockers.length === 0 && result.warnings.length === 0 && <p style={{ color: "#0D9B3A", fontSize: 12 }}>No configured static checks were triggered.</p>}
      </div>}
      <div style={{ ...panel, borderStyle: "dashed" }}>
        <strong style={{ fontSize: 12 }}>Important safety boundary</strong>
        <p style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.7, margin: "5px 0 0" }}>This is a lightweight lexical preflight, not a complete T-SQL parser, permission system or security boundary. It cannot prove that a query is harmless. It does not connect to SQL Server, inspect permissions or execute SQL. Database access must later be enforced server-side with a read-only database identity, statement timeout, row limits and an approved-object allowlist.</p>
      </div>
    </div>
  );
}
