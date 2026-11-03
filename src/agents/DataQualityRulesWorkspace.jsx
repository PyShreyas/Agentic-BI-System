import { useEffect, useMemo, useState } from "react";
import { readProfileCsvFile } from "./dataProfiling";
import {
  RULE_TYPES,
  validateRuleConfiguration,
  validateDatasetRules,
  buildValidationIssuesCsv,
  buildValidationSummaryCsv
} from "./dataQualityRules";

const STORAGE_KEY = "agenticBi.dataQualityRules.v1";
const panel = C => ({ background: C.bg, border: "1px solid " + C.border, borderRadius: 10, padding: 14 });
const muted = C => ({ color: C.textMuted, fontSize: 12, lineHeight: 1.6 });
const field = C => ({ width: "100%", boxSizing: "border-box", padding: 9, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "inherit", minWidth: 0 });

const emptyDraft = {
  name: "",
  type: "required",
  column: "",
  severity: "error",
  allowedText: "",
  min: "",
  max: "",
  minDate: "",
  maxDate: "",
  compareColumn: "",
  operator: "equals",
  caseInsensitive: false,
  allowBlank: false
};

function downloadCsv(content, fileName) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, C, tone }) {
  return <div style={{ ...panel(C), padding: 12 }}>
    <div style={{ ...muted(C), fontSize: 10, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: tone || C.accent, marginTop: 3 }}>{value}</div>
  </div>;
}

function IssueTable({ issues, C }) {
  return <div style={{ overflowX: "auto", marginTop: 9 }}>
    <table style={{ width: "100%", minWidth: 650, borderCollapse: "collapse", fontSize: 11 }}>
      <thead><tr>{["Row", "Rule", "Severity", "Column", "Value", "Issue"].map(label => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid " + C.border, color: C.textMuted }}>{label}</th>)}</tr></thead>
      <tbody>{issues.slice(0, 100).map((issue, index) => <tr key={issue.ruleId + "-" + issue.rowNumber + "-" + index}>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border }}>{issue.rowNumber}</td>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border }}>{issue.ruleName}</td>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border, color: issue.severity === "error" ? "#D64550" : "#C47A12", fontWeight: 700 }}>{issue.severity}</td>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border }}>{issue.column}</td>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{String(issue.value ?? "") || "—"}</td>
        <td style={{ padding: 8, borderBottom: "1px solid " + C.border }}>{issue.message}{issue.compareColumn ? " (" + issue.compareColumn + ": " + issue.compareValue + ")" : ""}</td>
      </tr>)}</tbody>
    </table>
    {issues.length > 100 && <p style={muted(C)}>Showing first 100 issues. Export the CSV for the complete exception list.</p>}
  </div>;
}

export default function DataQualityRulesWorkspace({ C }) {
  const [dataset, setDataset] = useState(null);
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) setRules(saved);
    } catch {
      setRules([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // The rule editor remains usable when browser storage is unavailable.
    }
  }, [rules]);

  const updateDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const visibleIssues = useMemo(() => (result?.issues || []).filter(issue => filter === "all" || issue.severity === filter), [result, filter]);

  const loadFile = async file => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const parsed = await readProfileCsvFile(file);
      setDataset(parsed);
      setDraft(previous => ({ ...previous, column: parsed.headers[0] || "", compareColumn: parsed.headers[1] || parsed.headers[0] || "" }));
    } catch (loadError) {
      setError(loadError.message || "Unable to read this CSV file.");
    } finally {
      setBusy(false);
    }
  };

  const makeRule = () => {
    const rule = {
      id: "rule-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      name: draft.name.trim() || RULE_TYPES.find(item => item.value === draft.type)?.label + " · " + draft.column,
      type: draft.type,
      column: draft.column,
      severity: draft.severity,
      enabled: true,
      caseInsensitive: draft.caseInsensitive,
      allowBlank: draft.allowBlank,
      allowedValues: draft.type === "allowedValues" ? draft.allowedText.split(",").map(value => value.trim()).filter(Boolean) : [],
      min: draft.min,
      max: draft.max,
      minDate: draft.minDate,
      maxDate: draft.maxDate,
      compareColumn: draft.compareColumn,
      operator: draft.operator
    };
    const validationError = validateRuleConfiguration(rule, dataset?.headers || []);
    if (validationError) {
      setError(validationError);
      return;
    }
    setRules(previous => [...previous, rule]);
    setDraft(previous => ({ ...emptyDraft, column: previous.column, compareColumn: previous.compareColumn }));
    setResult(null);
    setError("");
  };

  const runValidation = () => {
    if (!dataset) return setError("Upload a CSV dataset first.");
    if (!rules.some(rule => rule.enabled !== false)) return setError("Add or enable at least one validation rule.");
    try {
      setResult(validateDatasetRules(dataset, rules));
      setError("");
    } catch (validationError) {
      setError(validationError.message || "Validation could not be completed.");
    }
  };

  const addRecommendedRules = () => {
    if (!dataset) return;
    const existing = new Set(rules.map(rule => rule.type + "::" + rule.column));
    const additions = dataset.headers.filter(column => !existing.has("required::" + column)).map(column => ({
      id: "rule-" + Date.now() + "-" + column,
      name: "Required · " + column,
      type: "required",
      column,
      severity: "error",
      enabled: true,
      allowedValues: []
    }));
    setRules(previous => [...previous, ...additions]);
    setResult(null);
  };

  const filteredResults = result?.ruleResults.filter(item => filter === "all" || item.severity === filter) || [];

  return <div style={{ display: "grid", gap: 14 }}>
    <section style={panel(C)}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>SQL Agent · Data quality rules & validation</strong>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0D9B3A", background: "#0D9B3A18", borderRadius: 20, padding: "4px 8px" }}>Browser-local processing</span>
      </div>
      <p style={muted(C)}>Define reusable business rules, validate uploaded CSV records, and inspect row-level exceptions. Only rule definitions are saved in this browser; uploaded data is not stored or transmitted.</p>
      <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 700, marginTop: 12 }}>
        Select CSV dataset
        <input type="file" accept=".csv,text/csv" onChange={event => loadFile(event.target.files?.[0] || null)} style={{ ...field(C), fontSize: 11 }} />
        <span style={{ ...muted(C), fontWeight: 400 }}>{dataset ? dataset.fileName + " · " + dataset.rowCount.toLocaleString() + " rows · " + dataset.headers.length + " columns" : "CSV only · maximum 10 MB · processed in this browser"}</span>
      </label>
      {busy && <p style={muted(C)}>Reading CSV…</p>}
    </section>

    {dataset && <section style={panel(C)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><strong style={{ fontSize: 13 }}>Rule builder</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Add checks that represent your business expectations.</p></div>
        <button onClick={addRecommendedRules} style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Add required rule for every column</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 9, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Rule name<input value={draft.name} onChange={event => updateDraft("name", event.target.value)} placeholder="e.g. Cost must be positive" style={field(C)} /></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Rule type<select value={draft.type} onChange={event => updateDraft("type", event.target.value)} style={field(C)}>{RULE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Target column<select value={draft.column} onChange={event => updateDraft("column", event.target.value)} style={field(C)}>{dataset.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Severity<select value={draft.severity} onChange={event => updateDraft("severity", event.target.value)} style={field(C)}><option value="error">Error · must fix</option><option value="warning">Warning · review</option></select></label>
      </div>

      {draft.type === "allowedValues" && <div style={{ marginTop: 10 }}><label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Allowed values (comma-separated)<input value={draft.allowedText} onChange={event => updateDraft("allowedText", event.target.value)} placeholder="Active, Inactive, Maintenance" style={field(C)} /></label></div>}
      {draft.type === "numericRange" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Minimum<input type="number" value={draft.min} onChange={event => updateDraft("min", event.target.value)} placeholder="No minimum" style={field(C)} /></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Maximum<input type="number" value={draft.max} onChange={event => updateDraft("max", event.target.value)} placeholder="No maximum" style={field(C)} /></label>
      </div>}
      {draft.type === "dateRange" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Start date<input type="date" value={draft.minDate} onChange={event => updateDraft("minDate", event.target.value)} style={field(C)} /></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>End date<input type="date" value={draft.maxDate} onChange={event => updateDraft("maxDate", event.target.value)} style={field(C)} /></label>
      </div>}
      {draft.type === "compareColumns" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Compare with<select value={draft.compareColumn} onChange={event => updateDraft("compareColumn", event.target.value)} style={field(C)}>{dataset.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700 }}>Condition<select value={draft.operator} onChange={event => updateDraft("operator", event.target.value)} style={field(C)}><option value="equals">Equals</option><option value="notEquals">Does not equal</option><option value="greaterThan">Greater than</option><option value="lessThan">Less than</option><option value="greaterOrEqual">Greater than or equal</option><option value="lessOrEqual">Less than or equal</option></select></label>
      </div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
        {["allowedValues", "compareColumns"].includes(draft.type) && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}><input type="checkbox" checked={draft.caseInsensitive} onChange={event => updateDraft("caseInsensitive", event.target.checked)} />Ignore letter case</label>}
        {draft.type === "allowedValues" && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}><input type="checkbox" checked={draft.allowBlank} onChange={event => updateDraft("allowBlank", event.target.checked)} />Allow blank values</label>}
      </div>
      <button onClick={makeRule} style={{ marginTop: 12, padding: "9px 14px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700 }}>Add validation rule</button>

      <div style={{ marginTop: 16, borderTop: "1px solid " + C.border, paddingTop: 13 }}>
        <strong style={{ fontSize: 12 }}>Saved rule set ({rules.length})</strong>
        <p style={muted(C)}>Rules are automatically saved in local browser storage and reused on this device.</p>
        {rules.length ? <div style={{ display: "grid", gap: 7 }}>
          {rules.map(rule => <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 9, border: "1px solid " + C.border, borderRadius: 8, flexWrap: "wrap" }}>
            <input type="checkbox" checked={rule.enabled !== false} onChange={event => { setRules(previous => previous.map(item => item.id === rule.id ? { ...item, enabled: event.target.checked } : item)); setResult(null); }} />
            <div style={{ flex: 1, minWidth: 140 }}><strong style={{ fontSize: 11 }}>{rule.name}</strong><div style={muted(C)}>{rule.type} · {rule.column} · {rule.severity}</div></div>
            <button onClick={() => { setRules(previous => previous.filter(item => item.id !== rule.id)); setResult(null); }} style={{ border: "1px solid " + C.border, background: C.surface, color: C.text, borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 10 }}>Remove</button>
          </div>)}
        </div> : <p style={muted(C)}>No rules added yet.</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button onClick={runValidation} disabled={!rules.some(rule => rule.enabled !== false)} style={{ padding: "9px 14px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, opacity: rules.some(rule => rule.enabled !== false) ? 1 : .5 }}>Run validation</button>
        <button onClick={() => { setRules([]); setResult(null); }} style={{ padding: "9px 12px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Clear saved rules</button>
      </div>
    </section>}

    {error && <p role="alert" style={{ color: "#D64550", fontSize: 12, margin: 0 }}>{error}</p>}

    {result && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 9 }}>
        <Metric C={C} label="Data quality" value={result.qualityPercentage + "%"} tone={result.qualityPercentage >= 95 ? "#0D9B3A" : result.qualityPercentage >= 85 ? "#C47A12" : "#D64550"} />
        <Metric C={C} label="Rules evaluated" value={result.rulesEvaluated} />
        <Metric C={C} label="Passed checks" value={result.passed} tone="#0D9B3A" />
        <Metric C={C} label="Failed checks" value={result.failed} tone={result.failed ? "#D64550" : "#0D9B3A"} />
        <Metric C={C} label="Errors" value={result.errors} tone={result.errors ? "#D64550" : "#0D9B3A"} />
        <Metric C={C} label="Warnings" value={result.warnings} tone={result.warnings ? "#C47A12" : "#0D9B3A"} />
      </section>
      <section style={panel(C)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 13 }}>Rule results</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Pass rates are calculated over non-skipped records for each rule.</p></div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button onClick={() => downloadCsv(buildValidationSummaryCsv(result), "data-quality-rule-summary.csv")} style={{ padding: "7px 9px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10 }}>Export summary</button>
            <button onClick={() => downloadCsv(buildValidationIssuesCsv(result), "data-quality-exceptions.csv")} style={{ padding: "7px 9px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10 }}>Export exceptions</button>
          </div>
        </div>
        <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
          {result.ruleResults.map(item => <div key={item.ruleId} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1.4fr) repeat(3, minmax(55px, .5fr)) minmax(75px, .7fr)", gap: 8, alignItems: "center", padding: 9, border: "1px solid " + C.border, borderRadius: 8, fontSize: 11 }}>
            <div><strong>{item.ruleName}</strong><div style={muted(C)}>{item.column} · {item.severity}</div></div><span>Pass: {item.passed}</span><span>Fail: {item.failed}</span><span>Skip: {item.skipped}</span><strong>{item.passPercentage}%</strong>
          </div>)}
        </div>
      </section>
      <section style={panel(C)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 13 }}>Row-level exceptions ({visibleIssues.length})</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Each failed rule creates an issue row. One source row may therefore appear more than once.</p></div>
          <select value={filter} onChange={event => setFilter(event.target.value)} style={{ ...field(C), width: 150, fontSize: 11 }}><option value="all">All severities</option><option value="error">Errors only</option><option value="warning">Warnings only</option></select>
        </div>
        {visibleIssues.length ? <IssueTable issues={visibleIssues} C={C} /> : <p style={muted(C)}>No exceptions for this filter.</p>}
      </section>
    </>}

    <p style={{ ...muted(C), margin: 0 }}>Method notes: empty values are skipped for optional range and comparison checks; required rules detect blanks. Unique checks ignore blanks and flag every occurrence of a duplicated non-blank value. Date rules require ISO YYYY-MM-DD. Numeric comparisons use parsed numbers. Quality percentage is the share of passed non-skipped rule checks, not a certification. Data is never corrected automatically.</p>
  </div>;
}
