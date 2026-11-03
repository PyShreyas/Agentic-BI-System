import { useState } from "react";

const fieldStyle = { width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--sql-border)", background: "var(--sql-surface)", color: "inherit", font: "inherit" };

export default function SQLAgentWorkspace({ C }) {
  const [schema, setSchema] = useState("dbo");
  const [objectName, setObjectName] = useState("");
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [explanation, setExplanation] = useState("");

  const generate = () => {
    if (!/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(schema.trim()) || !/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(objectName.trim())) {
      setFeedback("Enter valid schema and table/view identifiers.");
      return;
    }
    setQuery("SELECT TOP (100) *\nFROM [" + schema.trim() + "].[" + objectName.trim() + "];");
    setFeedback("Read-only starter query generated. The business question is context only; review columns and filters before use.");
    setExplanation("");
  };

  const validate = () => {
    const normalized = query.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
    const statements = normalized.split(";").map(value => value.trim()).filter(Boolean);
    const blocked = /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC(?:UTE)?|GRANT|REVOKE|DENY|BACKUP|RESTORE|DBCC|OPENROWSET|OPENDATASOURCE|INTO)\b/i.test(normalized);
    const valid = /^(SELECT|WITH)\b/i.test(normalized) && !blocked && statements.length === 1;
    setFeedback(valid
      ? "Preflight passed: one SELECT/CTE statement and no detected write/DDL keywords. This is not a security parser."
      : "Preflight blocked: use one SELECT or read-only CTE. Write/DDL/EXEC keywords and SELECT INTO are not allowed.");
  };

  const explain = () => {
    if (!query.trim()) { setExplanation("Enter a SQL statement first."); return; }
    const clauses = ["SELECT", "FROM", "JOIN", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "TOP"];
    const found = clauses.filter(clause => new RegExp("\\b" + clause.replace(" ", "\\s+") + "\\b", "i").test(query));
    setExplanation("Detected clauses: " + (found.join(", ") || "none") + ".\n\nSELECT chooses output columns; FROM identifies the source; JOIN combines related sources; WHERE filters rows; GROUP BY aggregates rows; HAVING filters groups; ORDER BY sorts results; TOP limits SQL Server output. Verify join keys, filters and business definitions against your schema.");
  };

  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 9, padding: 12 };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ padding: 12, ...panel }}>
        <strong style={{ fontSize: 13 }}>SQL Generator · SQL Server</strong>
        <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>Create a safe SELECT starter from a known table or view. No database connection or execution is performed.</p>
        <label style={{ display: "grid", gap: 5, fontSize: 12, marginBottom: 9 }}>Business question
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} placeholder="e.g. Find purchase orders with pending quotations" style={fieldStyle} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 9 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Schema<input value={schema} onChange={e => setSchema(e.target.value)} style={fieldStyle} /></label>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Table / view<input value={objectName} onChange={e => setObjectName(e.target.value)} placeholder="YourTableOrView" style={fieldStyle} /></label>
        </div>
        <button onClick={generate} style={{ marginTop: 10, padding: "9px 13px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700 }}>Generate SELECT</button>
      </div>
      <div style={panel}>
        <strong style={{ fontSize: 13 }}>Query workspace</strong>
        <textarea value={query} onChange={e => { setQuery(e.target.value); setFeedback(""); }} rows={9} spellCheck={false} placeholder="Paste or generate SQL here" style={{ ...fieldStyle, marginTop: 8, fontFamily: "monospace", fontSize: 12 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
          <button onClick={validate} style={{ padding: "8px 11px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer" }}>Read-only preflight</button>
          <button onClick={explain} style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Explain query</button>
        </div>
        {feedback && <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>{feedback}</p>}
        {explanation && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6 }}>{explanation}</pre>}
      </div>
      <p style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.6, margin: 0 }}>Safety boundary: this is a client-side convenience check, not a complete SQL parser or security control. Query execution and database connectivity are intentionally disabled.</p>
    </div>
  );
}
