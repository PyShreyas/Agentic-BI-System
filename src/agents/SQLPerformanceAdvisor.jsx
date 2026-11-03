import { useMemo, useState } from "react";
import { analyzeSqlPerformance } from "./sqlPerformanceAnalysis";

const examples = {
  "Date filter with function": `SELECT *
FROM dbo.PurchaseOrders
WHERE YEAR(Created_Date) = 2026
ORDER BY Created_Date DESC;`,
  "Search and duplicate review": `SELECT DISTINCT Vessel_Id, Vessel_Name
FROM dbo.Vessels
WHERE Vessel_Name LIKE '%SEA%'
   OR Vessel_Code = 'SEA01';`,
  "Subquery exclusion": `SELECT po.PurchaseOrder_Id, po.Vessel_Id
FROM dbo.PurchaseOrders AS po
WHERE po.Vessel_Id NOT IN (
    SELECT v.Vessel_Id
    FROM dbo.Vessels AS v
    WHERE v.Is_Active = 0
);`,
  "Unbounded read": `SELECT Vessel_Id, SUM(Amount) AS TotalSpend
FROM dbo.PurchaseOrders
GROUP BY Vessel_Id
ORDER BY TotalSpend DESC;`
};

const severityColor = {
  high: "#D64550",
  medium: "#C47A12",
  low: "#1688C9"
};

export default function SQLPerformanceAdvisor({ C }) {
  const [query, setQuery] = useState("");
  const [example, setExample] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const result = useMemo(() => reviewed && query.trim() ? analyzeSqlPerformance(query) : null, [reviewed, query]);
  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 10, padding: 14 };
  const muted = { color: C.textMuted, fontSize: 12, lineHeight: 1.6 };
  const field = { width: "100%", boxSizing: "border-box", padding: 11, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "inherit" };

  const loadExample = value => {
    setExample(value);
    setQuery(examples[value] || "");
    setReviewed(false);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={panel}>
        <strong style={{ fontSize: 14 }}>SQL performance & query quality advisor</strong>
        <p style={muted}>Run a local, rule-based review of a SQL Server SELECT statement. Findings are potential review points—not measured performance results or proof of a defect. No query is executed.</p>
        <label style={{ display: "grid", gap: 6, fontSize: 11, marginBottom: 10 }}>
          Load an example
          <select value={example} onChange={event => loadExample(event.target.value)} style={field}>
            <option value="">Choose a sample query</option>
            {Object.keys(examples).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 11 }}>
          SQL query
          <textarea value={query} onChange={event => { setQuery(event.target.value); setReviewed(false); }} rows={12} spellCheck={false} placeholder="Paste a SQL Server SELECT query here..." style={{ ...field, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12, lineHeight: 1.55 }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={() => setReviewed(Boolean(query.trim()))} disabled={!query.trim()} style={{ padding: "9px 13px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: query.trim() ? "pointer" : "not-allowed", opacity: query.trim() ? 1 : 0.55, fontWeight: 700 }}>Review query</button>
          <button onClick={() => { setQuery(""); setExample(""); setReviewed(false); }} style={{ padding: "9px 13px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Clear</button>
        </div>
      </section>

      {!result && <div style={{ ...panel, ...muted }}>Your review findings will appear here after you paste a query and select Review query.</div>}

      {result && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 9 }}>
          {[
            ["Total findings", result.findings.length, C.accent],
            ["High", result.counts.high, severityColor.high],
            ["Medium", result.counts.medium, severityColor.medium],
            ["Low", result.counts.low, severityColor.low]
          ].map(([label, value, color]) => <div key={label} style={{ ...panel, padding: 12 }}>
            <div style={{ ...muted, fontSize: 10, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
          </div>)}
        </section>
        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Review summary</strong>
          <p style={{ ...muted, margin: "5px 0 0" }}>{result.summary}</p>
        </section>
        <section style={{ display: "grid", gap: 10 }}>
          {result.findings.length ? result.findings.map(item => <article key={item.id} style={{ ...panel, background: C.surface }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".05em", color: severityColor[item.severity], border: "1px solid " + severityColor[item.severity], borderRadius: 20, padding: "3px 8px" }}>{item.severity.toUpperCase()}</span>
              <strong style={{ fontSize: 13 }}>{item.title}</strong>
            </div>
            <p style={{ ...muted, color: C.text, margin: "9px 0 6px" }}>{item.detail}</p>
            <div style={{ padding: 10, borderRadius: 7, background: C.bg, border: "1px solid " + C.border }}>
              <div style={{ ...muted, fontSize: 10, fontWeight: 800, marginBottom: 3 }}>SUGGESTED REVIEW</div>
              <p style={{ ...muted, color: C.text, margin: 0 }}>{item.recommendation}</p>
            </div>
            <div style={{ ...muted, fontSize: 10, marginTop: 7 }}>Pattern detected: <code>{item.evidence}</code></div>
          </article>) : <div style={panel}><strong style={{ fontSize: 13 }}>No configured patterns detected</strong><p style={muted}>This is not a performance certification. Review the actual execution plan, indexes, row counts, statistics and workload before drawing conclusions.</p></div>}
        </section>
        <section style={{ ...panel, borderStyle: "dashed" }}>
          <strong style={{ fontSize: 12 }}>Important limitations</strong>
          <ul style={{ ...muted, paddingLeft: 18, marginBottom: 0 }}>
            <li>Static pattern matching only; not a complete T-SQL parser.</li>
            <li>Severity indicates review priority, not measured impact.</li>
            <li>No database connection, metadata lookup, execution plan or query execution.</li>
            <li>Validate every suggestion against business logic and the actual SQL Server execution plan.</li>
          </ul>
        </section>
      </>}
    </div>
  );
}
