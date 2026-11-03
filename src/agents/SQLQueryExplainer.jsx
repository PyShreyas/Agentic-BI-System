import { useMemo, useState } from "react";
import { describeAdvancedQuery } from "./sqlQueryAnalysis";

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: 11,
  borderRadius: 8,
  border: "1px solid var(--sql-border)",
  background: "var(--sql-surface)",
  color: "inherit",
  font: "inherit",
};

const examples = {
  "Vessel-wise purchase orders": `SELECT
    v.Vessel_Name,
    COUNT(po.PO_Id) AS PurchaseOrderCount
FROM dbo.Vessels AS v
INNER JOIN dbo.PurchaseOrders AS po
    ON po.Vessel_Id = v.Vessel_Id
WHERE po.Created_Date >= '2026-01-01'
GROUP BY v.Vessel_Name
HAVING COUNT(po.PO_Id) > 0
ORDER BY PurchaseOrderCount DESC;`,
  "Recent open requests": `SELECT TOP (100)
    Request_Id,
    Request_Status,
    Created_Date
FROM dbo.PurchaseRequests
WHERE Request_Status = 'Open'
ORDER BY Created_Date DESC;`,
  "CTE with ranking": `WITH VesselTotals AS (
    SELECT Vessel_Id, COUNT(*) AS TotalOrders
    FROM dbo.PurchaseOrders
    GROUP BY Vessel_Id
)
SELECT Vessel_Id, TotalOrders
FROM VesselTotals
WHERE TotalOrders >= 5
ORDER BY TotalOrders DESC;`,
};

const clauseDefinitions = [
  { key: "WITH", label: "CTE", pattern: /\bWITH\b/i, purpose: "Defines a common table expression (a named query result) that can be referenced by the statement that follows." },
  { key: "SELECT", label: "SELECT", pattern: /\bSELECT\b/i, purpose: "Chooses the columns, expressions and calculations returned in the result set." },
  { key: "TOP", label: "TOP", pattern: /\bTOP\s*(?:\(\s*\d+\s*\)|\d+)/i, purpose: "Limits how many rows SQL Server returns. Without ORDER BY, the selected rows are not guaranteed to be the most recent or highest priority." },
  { key: "FROM", label: "FROM", pattern: /\bFROM\b/i, purpose: "Identifies the primary table, view, CTE or derived source being queried." },
  { key: "JOIN", label: "JOIN", pattern: /\b(?:INNER|LEFT|RIGHT|FULL\s+OUTER|FULL|CROSS)?\s*JOIN\b/i, purpose: "Combines rows from another source. The ON predicate determines which rows match; verify the key and expected cardinality." },
  { key: "WHERE", label: "WHERE", pattern: /\bWHERE\b/i, purpose: "Filters individual rows before grouping and aggregation." },
  { key: "GROUP BY", label: "GROUP BY", pattern: /\bGROUP\s+BY\b/i, purpose: "Groups rows so aggregate expressions such as COUNT, SUM or AVG can be calculated per group." },
  { key: "HAVING", label: "HAVING", pattern: /\bHAVING\b/i, purpose: "Filters groups after aggregation, often using aggregate expressions." },
  { key: "UNION", label: "UNION", pattern: /\bUNION(?:\s+ALL)?\b/i, purpose: "Combines the output rows of compatible SELECT statements. UNION removes duplicates; UNION ALL keeps them." },
  { key: "ORDER BY", label: "ORDER BY", pattern: /\bORDER\s+BY\b/i, purpose: "Sorts the final result. Specify a deterministic tie-breaker when row order matters." },
];

function removeComments(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function describeQuery(sql) {
  const normalized = removeComments(sql).trim();
  const clauses = clauseDefinitions
    .filter(item => item.pattern.test(normalized))
    .map(item => ({ label: item.label, purpose: item.purpose }));
  const joinMatches = [...normalized.matchAll(/\b(INNER|LEFT|RIGHT|FULL\s+OUTER|FULL|CROSS)?\s*JOIN\b/gi)];
  const joinTypes = joinMatches.map(match => (match[1] || "JOIN").replace(/\s+/g, " ").toUpperCase());
  const sourceMatches = [...normalized.matchAll(/\b(?:FROM|JOIN)\s+((?:\[[^\]]+\]|[A-Za-z_][\w$#]*)(?:\s*\.\s*(?:\[[^\]]+\]|[A-Za-z_][\w$#]*))?)/gi)];
  const sources = [...new Set(sourceMatches.map(match => match[1].replace(/\s+/g, "")))];
  const aggregates = ["COUNT", "SUM", "AVG", "MIN", "MAX"].filter(name => new RegExp("\\b" + name + "\\s*\\(", "i").test(normalized));
  const notes = [];

  if (/\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(normalized)) notes.push("SELECT * returns every available column. Prefer an explicit column list for maintainability and to avoid pulling unnecessary data.");
  if (joinTypes.some(type => type === "CROSS")) notes.push("CROSS JOIN creates combinations of every row from both inputs. Confirm that this row multiplication is intentional.");
  if (joinTypes.some(type => type === "LEFT" || type === "RIGHT" || type.startsWith("FULL"))) notes.push("An outer join can retain unmatched rows with NULL values on one side. Check whether later WHERE predicates unintentionally remove those rows.");
  if (joinTypes.length && !/\bON\b/i.test(normalized) && !joinTypes.includes("CROSS")) notes.push("A JOIN was detected but no ON keyword was found. Confirm whether the syntax is complete or whether a CROSS JOIN is intended.");
  if (aggregates.length && !/\bGROUP\s+BY\b/i.test(normalized)) notes.push("Aggregate functions were detected without GROUP BY. The query may return a single summary row; confirm that this is intended.");
  if (/\bTOP\s*(?:\(\s*\d+\s*\)|\d+)/i.test(normalized) && !/\bORDER\s+BY\b/i.test(normalized)) notes.push("TOP is used without ORDER BY, so SQL Server does not guarantee which rows are returned.");
  if (/\bWHERE\b/i.test(normalized) && /\b(LEFT|RIGHT|FULL(?:\s+OUTER)?)\s+JOIN\b/i.test(normalized)) notes.push("Review WHERE predicates on the nullable side of an outer join; they may change the effective result to behave like an inner join.");
  if (!/\bWHERE\b/i.test(normalized)) notes.push("No WHERE clause was detected. The statement may read all rows from its source(s); check expected data volume.");
  if (/\bNOLOCK\b/i.test(normalized)) notes.push("NOLOCK can read uncommitted or inconsistent data. Use it only when its consistency trade-offs are explicitly accepted.");
  if (/\bUNION\b/i.test(normalized) && !/\bUNION\s+ALL\b/i.test(normalized)) notes.push("UNION removes duplicate rows and may require extra work. Use UNION ALL only when retaining duplicates is correct for the business requirement.");

  const flow = [];
  if (/\bWITH\b/i.test(normalized)) flow.push("A CTE is defined first");
  flow.push("Rows are read from the source");
  if (joinTypes.length) flow.push("Sources are combined using " + joinTypes.join(", ") + " join(s)");
  if (/\bWHERE\b/i.test(normalized)) flow.push("Rows are filtered");
  if (/\bGROUP\s+BY\b/i.test(normalized)) flow.push("Rows are grouped and aggregates calculated");
  if (/\bHAVING\b/i.test(normalized)) flow.push("Groups are filtered");
  if (/\bORDER\s+BY\b/i.test(normalized)) flow.push("The result is sorted");
  if (/\bTOP\s*(?:\(\s*\d+\s*\)|\d+)/i.test(normalized)) flow.push("The output is limited by TOP");

  return { clauses, joinTypes, sources, aggregates, notes, flow };
}

export default function SQLQueryExplainer({ C }) {
  const [query, setQuery] = useState("");
  const [selectedExample, setSelectedExample] = useState("");
  const [hasExplained, setHasExplained] = useState(false);
  const result = useMemo(() => hasExplained && query.trim() ? { ...describeQuery(query), advanced: describeAdvancedQuery(query) } : null, [hasExplained, query]);
  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 9, padding: 13 };
  const muted = { color: C.textMuted, fontSize: 12, lineHeight: 1.6 };

  const loadExample = value => {
    setSelectedExample(value);
    setQuery(examples[value] || "");
    setHasExplained(false);
  };

  const explain = () => setHasExplained(Boolean(query.trim()));

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={panel}>
        <strong style={{ fontSize: 14 }}>SQL Server query explainer</strong>
        <p style={muted}>Paste a SELECT query or CTE to get a structured explanation of its clauses, source objects, joins, aggregation and likely review points. Analysis is local and rule-based; it does not execute SQL or understand your organisation's business definitions.</p>
        <label style={{ display: "grid", gap: 6, fontSize: 11, marginBottom: 10 }}>
          Load an example
          <select value={selectedExample} onChange={event => loadExample(event.target.value)} style={fieldStyle}>
            <option value="">Choose a sample query</option>
            {Object.keys(examples).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 11 }}>
          SQL query
          <textarea value={query} onChange={event => { setQuery(event.target.value); setHasExplained(false); }} rows={13} spellCheck={false} placeholder="Paste your SQL Server SELECT statement or CTE here..." style={{ ...fieldStyle, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12, lineHeight: 1.55 }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={explain} disabled={!query.trim()} style={{ padding: "9px 13px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: query.trim() ? "pointer" : "not-allowed", opacity: query.trim() ? 1 : 0.55, fontWeight: 700 }}>Explain query</button>
          <button onClick={() => { setQuery(""); setSelectedExample(""); setHasExplained(false); }} style={{ padding: "9px 13px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Clear</button>
        </div>
      </section>

      {!result && <div style={{ ...panel, ...muted }}>Your explanation will appear here after you select an example or paste a query and choose <strong>Explain query</strong>.</div>}

      {result && <>
        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Query flow</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
            {result.flow.map((step, index) => <span key={step} style={{ padding: "7px 9px", borderRadius: 7, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 11 }}>{index + 1}. {step}</span>)}
          </div>
        </section>

        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Detected SQL clauses</strong>
          {result.clauses.length ? <div style={{ display: "grid", gap: 9, marginTop: 11 }}>
            {result.clauses.map(item => <div key={item.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10, paddingBottom: 8, borderBottom: "1px solid " + C.border }}>
              <strong style={{ color: C.accent, fontSize: 11 }}>{item.label}</strong>
              <span style={{ ...muted, color: C.text }}>{item.purpose}</span>
            </div>)}
          </div> : <p style={muted}>No recognised SQL clauses were found. Check the statement text.</p>}
        </section>

        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Sources and operations</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <div><span style={{ ...muted, fontWeight: 700 }}>Source objects</span><p style={{ ...muted, margin: "3px 0 0", color: C.text }}>{result.sources.length ? result.sources.join(", ") : "No table or view names could be identified by the simple pattern matcher."}</p></div>
            <div><span style={{ ...muted, fontWeight: 700 }}>Join types</span><p style={{ ...muted, margin: "3px 0 0", color: C.text }}>{result.joinTypes.length ? result.joinTypes.join(", ") : "No JOIN clause detected."}</p></div>
            <div><span style={{ ...muted, fontWeight: 700 }}>Aggregate functions</span><p style={{ ...muted, margin: "3px 0 0", color: C.text }}>{result.aggregates.length ? result.aggregates.join(", ") : "No common aggregate function detected."}</p></div>
          </div>
        </section>

        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Advanced query structures</strong>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div>
              <span style={{ ...muted, fontWeight: 700 }}>Common table expressions (CTEs)</span>
              <p style={{ ...muted, margin: "3px 0 0", color: C.text }}>{result.advanced.ctes.length ? result.advanced.ctes.map(item => item.name + " (line " + item.line + ")").join(" · ") : "No CTE definitions detected."}</p>
            </div>
            <div>
              <span style={{ ...muted, fontWeight: 700 }}>Nested queries</span>
              {result.advanced.nestedQueries.length ? result.advanced.nestedQueries.map(item => <p key={item.label + item.line} style={{ ...muted, margin: "4px 0 0", color: C.text }}>{item.label}: {item.location}, nesting depth {item.depth} (line {item.line})</p>) : <p style={{ ...muted, margin: "3px 0 0", color: C.text }}>No nested SELECT statements detected.</p>}
            </div>
            <div>
              <span style={{ ...muted, fontWeight: 700 }}>Window functions</span>
              {result.advanced.windowFunctions.length ? result.advanced.windowFunctions.map((item, index) => <p key={item.name + item.line + index} style={{ ...muted, margin: "4px 0 0", color: C.text }}>{item.name} · {item.kind} · line {item.line}</p>) : <p style={{ ...muted, margin: "3px 0 0", color: C.text }}>No recognised window functions detected.</p>}
            </div>
          </div>
        </section>

        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Step-by-step explanation</strong>
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {result.advanced.steps.map((step, index) => <div key={step.title + index} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 9, alignItems: "start" }}>
              <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 20, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700 }}>{index + 1}</span>
              <div><strong style={{ fontSize: 12, color: C.text }}>{step.title}{step.line ? " · line " + step.line : ""}</strong><p style={{ ...muted, margin: "3px 0 0" }}>{step.detail}</p></div>
            </div>)}
          </div>
          {result.advanced.notes.length > 0 && <ul style={{ ...muted, paddingLeft: 18, marginBottom: 0, color: C.text }}>{result.advanced.notes.map(note => <li key={note} style={{ marginTop: 5 }}>{note}</li>)}</ul>}
        </section>

        <section style={panel}>
          <strong style={{ fontSize: 13 }}>Review points</strong>
          {result.notes.length ? <ul style={{ ...muted, margin: "9px 0 0", paddingLeft: 19, color: C.text }}>{result.notes.map(note => <li key={note} style={{ marginBottom: 6 }}>{note}</li>)}</ul> : <p style={muted}>No common review patterns were detected. This does not prove the query is correct.</p>}
        </section>
        <p style={{ ...muted, margin: 0 }}>Interpretation boundary: this is a lightweight lexical explainer, not a complete T-SQL parser. It may miss nested or unusual syntax and cannot verify schema, permissions, join correctness, performance or business meaning. Use Query Validator separately for the read-only preflight; neither tool is a security boundary.</p>
      </>}
    </div>
  );
}
