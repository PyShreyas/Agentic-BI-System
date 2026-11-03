import { useState } from "react";

const fieldStyle = { width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid var(--sql-border)", background: "var(--sql-surface)", color: "inherit", font: "inherit" };
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$#]*$/;
const quoteIdentifier = value => "[" + value.trim().replace(/\]/g, "]]") + "]";

export default function SQLAgentWorkspace({ C }) {
  const [question, setQuestion] = useState("");
  const [tables, setTables] = useState([{ schema: "dbo", name: "", alias: "t1", joinCondition: "" }]);
  const [selectColumns, setSelectColumns] = useState("*");
  const [whereConditions, setWhereConditions] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [orderBy, setOrderBy] = useState("");
  const [topCount, setTopCount] = useState("100");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [explanation, setExplanation] = useState("");

  const updateTable = (index, field, value) => {
    setTables(current => current.map((table, i) => i === index ? { ...table, [field]: value } : table));
  };

  const addTable = () => setTables(current => current.length >= 8 ? current : [
    ...current,
    { schema: "dbo", name: "", alias: "t" + (current.length + 1), joinCondition: "" },
  ]);

  const removeTable = index => setTables(current => current.filter((_, i) => i !== index));

  const generate = () => {
    if (!tables.length || tables.some(table =>
      !identifierPattern.test(table.schema.trim()) ||
      !identifierPattern.test(table.name.trim()) ||
      !identifierPattern.test(table.alias.trim())
    )) {
      setFeedback("Enter valid schema, table/view and alias identifiers for every source.");
      return;
    }
    const duplicateAliases = tables.map(table => table.alias.trim().toLowerCase()).filter((alias, i, all) => all.indexOf(alias) !== i);
    if (duplicateAliases.length) {
      setFeedback("Each table must have a unique alias.");
      return;
    }
    const parsedTop = Number(topCount);
    if (!Number.isInteger(parsedTop) || parsedTop < 1 || parsedTop > 1000) {
      setFeedback("TOP must be a whole number between 1 and 1000.");
      return;
    }
    if (!selectColumns.trim()) {
      setFeedback("Specify at least one output column or expression.");
      return;
    }

    const first = tables[0];
    const lines = [
      "SELECT TOP (" + parsedTop + ")",
      "    " + selectColumns.trim(),
      "FROM " + quoteIdentifier(first.schema) + "." + quoteIdentifier(first.name) + " AS " + first.alias.trim(),
    ];
    const missingConditions = [];
    tables.slice(1).forEach((table, index) => {
      const condition = table.joinCondition.trim();
      const source = quoteIdentifier(table.schema) + "." + quoteIdentifier(table.name) + " AS " + table.alias.trim();
      if (condition) lines.push("INNER JOIN " + source + " ON " + condition);
      else missingConditions.push(index + 2);
    });
    if (whereConditions.trim()) lines.push("WHERE " + whereConditions.trim());
    if (groupBy.trim()) lines.push("GROUP BY " + groupBy.trim());
    if (orderBy.trim()) lines.push("ORDER BY " + orderBy.trim());
    lines.push(";");
    setQuery(lines.join("\n"));
    setFeedback(missingConditions.length
      ? "Starter generated. Add an ON condition for source(s) " + missingConditions.join(", ") + " before using the query. Join keys are never guessed."
      : "Query starter generated from the fields you supplied. Review column names, filter logic, aggregation and join cardinality; nothing is inferred from the business question.");
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
    setExplanation("Detected clauses: " + (found.join(", ") || "none") + "\n\nSELECT chooses output columns; FROM identifies the source; JOIN combines related sources; WHERE filters rows; GROUP BY aggregates rows; HAVING filters groups; ORDER BY sorts results; TOP limits SQL Server output. Verify join keys, filters and business definitions against your schema.");
  };

  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 9, padding: 12 };
  const fieldLabel = { display: "grid", gap: 5, fontSize: 11 };
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ padding: 12, ...panel }}>
        <strong style={{ fontSize: 13 }}>Business question → SQL specification · SQL Server</strong>
        <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>Describe the business requirement, select source tables/views, and provide the output columns, filters and grouping rules. The builder assembles a query from your explicit inputs; it does not infer schema, columns or join keys.</p>
        <label style={{ ...fieldLabel, marginBottom: 12 }}>Business question
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} placeholder="e.g. Show vessel-wise purchase order counts for the current year" style={fieldStyle} />
        </label>
        <div style={{ display: "grid", gap: 10 }}>
          {tables.map((table, index) => (
            <div key={table.alias + "-" + index} style={{ border: "1px solid " + C.border, borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 12 }}>{index === 0 ? "Base table / view" : "Join source " + index}</strong>
                {index > 0 && <button onClick={() => removeTable(index)} style={{ border: 0, background: "transparent", color: C.textMuted, cursor: "pointer" }}>Remove</button>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 0.8fr", gap: 8 }}>
                <label style={fieldLabel}>Schema<input value={table.schema} onChange={e => updateTable(index, "schema", e.target.value)} style={fieldStyle} placeholder="dbo" /></label>
                <label style={fieldLabel}>Table / view<input value={table.name} onChange={e => updateTable(index, "name", e.target.value)} style={fieldStyle} placeholder="YourTableOrView" /></label>
                <label style={fieldLabel}>Alias<input value={table.alias} onChange={e => updateTable(index, "alias", e.target.value)} style={fieldStyle} /></label>
              </div>
              {index > 0 && <label style={fieldLabel}>JOIN ON condition<input value={table.joinCondition} onChange={e => updateTable(index, "joinCondition", e.target.value)} style={fieldStyle} placeholder="t1.Vessel_Id = t2.Vessel_Id" /></label>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={addTable} disabled={tables.length >= 8} style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>+ Add table / view</button>
        </div>
        <div style={{ borderTop: "1px solid " + C.border, marginTop: 14, paddingTop: 12, display: "grid", gap: 10 }}>
          <strong style={{ fontSize: 12 }}>Query specification</strong>
          <label style={fieldLabel}>Output columns / expressions<textarea value={selectColumns} onChange={e => setSelectColumns(e.target.value)} rows={2} style={fieldStyle} placeholder="t1.Vessel_Name, COUNT(*) AS PurchaseOrderCount" /></label>
          <label style={fieldLabel}>WHERE conditions (optional)<textarea value={whereConditions} onChange={e => setWhereConditions(e.target.value)} rows={2} style={fieldStyle} placeholder="t1.Created_Date >= '2026-01-01' AND t1.Status = 'Open'" /></label>
          <label style={fieldLabel}>GROUP BY columns (optional)<input value={groupBy} onChange={e => setGroupBy(e.target.value)} style={fieldStyle} placeholder="t1.Vessel_Name" /></label>
          <label style={fieldLabel}>ORDER BY expression (optional)<input value={orderBy} onChange={e => setOrderBy(e.target.value)} style={fieldStyle} placeholder="PurchaseOrderCount DESC" /></label>
          <label style={{ ...fieldLabel, maxWidth: 180 }}>Maximum rows (TOP)
            <input type="number" min="1" max="1000" value={topCount} onChange={e => setTopCount(e.target.value)} style={fieldStyle} />
          </label>
          <button onClick={generate} style={{ padding: "10px 13px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700 }}>Generate SQL from specification</button>
        </div>
      </div>
      <div style={panel}>
        <strong style={{ fontSize: 13 }}>Query workspace</strong>
        <textarea value={query} onChange={e => { setQuery(e.target.value); setFeedback(""); }} rows={10} spellCheck={false} placeholder="Generated SQL appears here; you can edit it" style={{ ...fieldStyle, marginTop: 8, fontFamily: "monospace", fontSize: 12 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
          <button onClick={validate} style={{ padding: "8px 11px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer" }}>Read-only preflight</button>
          <button onClick={explain} style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Explain query</button>
        </div>
        {feedback && <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>{feedback}</p>}
        {explanation && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6 }}>{explanation}</pre>}
      </div>
      <p style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.6, margin: 0 }}>Safety boundary: preflight is a client-side convenience check, not a complete SQL parser or security control. No database connection or query execution is enabled. Supply and verify every column, filter, aggregation and join condition against an approved schema.</p>
    </div>
  );
}
