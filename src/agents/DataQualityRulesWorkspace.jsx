import { useEffect, useMemo, useState } from "react";
import { profileDataset, readProfileCsvFile } from "./dataProfiling";
import {
  RULE_TYPES,
  validateRuleConfiguration,
  validateDatasetRules,
  buildValidationIssuesCsv,
  buildValidationSummaryCsv,
  buildProfileRuleSuggestions
} from "./dataQualityRules";
import { createRuleSetExport, parseRuleSetImport, findRuleSetColumnReferences, remapRuleSetColumns } from "./ruleSetLibrary";

const STORAGE_KEY = "agenticBi.dataQualityRules.v1";
const HISTORY_KEY = "agenticBi.dataQualityHistory.v1";
const RULE_SET_LIBRARY_KEY = "agenticBi.dataQualityRuleSets.v1";
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

function downloadJson(content, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

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
  const [profile, setProfile] = useState(null);
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [ruleSets, setRuleSets] = useState([]);
  const [ruleSetName, setRuleSetName] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [columnMap, setColumnMap] = useState({});

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


  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RULE_SET_LIBRARY_KEY) || "[]");
      if (Array.isArray(saved)) setRuleSets(saved.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.rules)));
    } catch { setRuleSets([]); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(RULE_SET_LIBRARY_KEY, JSON.stringify(ruleSets.slice(0, 50))); }
    catch { /* The rule editor remains usable when browser storage is unavailable. */ }
  }, [ruleSets]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) setHistory(saved);
    } catch { setHistory([]); }
  }, []);

  useEffect(() => {
    if (!result) return;
    const snapshot = { fileName: result.fileName, timestamp: new Date().toISOString(), qualityPercentage: result.qualityPercentage, errors: result.errors, warnings: result.warnings, failed: result.failed, rowCount: result.rowCount };
    setHistory(previous => {
      const next = [snapshot, ...previous].slice(0, 100);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Optional local history. */ }
      return next;
    });
  }, [result]);

  const saveCurrentRuleSet = () => {
    const name = ruleSetName.trim();
    if (!name) return setError("Enter a name for this rule set.");
    if (!rules.length) return setError("Add at least one rule before saving a rule set.");
    if (ruleSets.length >= 50) return setError("The local library can hold up to 50 rule sets. Delete one before adding another.");
    const now = new Date().toISOString();
    setRuleSets(previous => [{ id: "rule-set-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), name: name.slice(0, 80), rules: rules.map(rule => ({ ...rule })), createdAt: now, updatedAt: now }, ...previous]);
    setRuleSetName("");
    setError("");
  };

  const loadRuleSet = savedSet => {
    setRules(savedSet.rules.map((rule, index) => ({ ...rule, id: "loaded-" + Date.now() + "-" + index })));
    setResult(null);
    setError("");
  };

  const deleteRuleSet = id => setRuleSets(previous => previous.filter(item => item.id !== id));

  const previewRuleSetImport = async file => {
    if (!file) return;
    setError("");
    try {
      if (file.size > 1024 * 1024) throw new Error("Rule-set JSON files must be 1 MB or smaller.");
      const parsed = parseRuleSetImport(await file.text());
      const references = findRuleSetColumnReferences(parsed.rules);
      const missingColumns = dataset ? references.filter(column => !dataset.headers.includes(column)) : [];
      setImportPreview({ ...parsed, missingColumns, fileName: file.name });
      setColumnMap({});
    } catch (importError) {
      setImportPreview(null);
      setError(importError.message || "Unable to preview this rule set.");
    }
  };

  const confirmRuleSetImport = () => {
    if (!importPreview) return;
    const unresolved = importPreview.missingColumns.filter(column => !columnMap[column]);
    if (unresolved.length) return setError("Map every missing column before importing this rule set.");
    const mappedRules = remapRuleSetColumns(importPreview.rules, columnMap);
    const now = new Date().toISOString();
    const imported = { id: "rule-set-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), name: importPreview.name, rules: mappedRules, createdAt: now, updatedAt: now };
    setRuleSets(previous => [imported, ...previous].slice(0, 50));
    setImportPreview(null);
    setColumnMap({});
    setError("");
  };

  const updateDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const visibleIssues = useMemo(() => (result?.issues || []).filter(issue => filter === "all" || issue.severity === filter), [result, filter]);

  const loadFile = async file => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    setProfile(null);
    setDataset(null);
    try {
      const parsed = await readProfileCsvFile(file);
      setDataset(parsed);
      setProfile(profileDataset(parsed));
      setDraft(previous => ({ ...previous, column: parsed.headers[0] || "", compareColumn: parsed.headers[1] || parsed.headers[0] || "" }));
    } catch (loadError) {
      setProfile(null);
      setDataset(null);
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
  const profileSuggestions = useMemo(() => buildProfileRuleSuggestions(profile), [profile]);
  const addProfileSuggestion = suggestion => {
    const alreadyExists = rules.some(rule => rule.type === suggestion.type && rule.column === suggestion.column);
    if (alreadyExists) {
      setError("A " + suggestion.type + " rule already exists for " + suggestion.column + ".");
      return;
    }
    const { key, rationale, ...ruleConfig } = suggestion;
    setRules(previous => [...previous, {
      ...ruleConfig,
      id: "profile-rule-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      profileRationale: rationale
    }]);
    setResult(null);
    setError("");
  };
  const addAllProfileSuggestions = () => {
    const existing = new Set(rules.map(rule => rule.type + "::" + rule.column));
    const additions = profileSuggestions.filter(item => !existing.has(item.type + "::" + item.column));
    setRules(previous => [...previous, ...additions.map(({ key, rationale, ...ruleConfig }) => ({
      ...ruleConfig,
      id: "profile-rule-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      profileRationale: rationale
    }))]);
    setResult(null);
    setError("");
  };


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

    <section style={panel(C)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><strong style={{ fontSize: 13 }}>Reusable rule-set library</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Save named rule collections, reuse them across CSV files, and move them between devices with JSON exports.</p></div>
        <span style={{ ...muted(C), fontSize: 10 }}>Local only · up to 50 rule sets</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input value={ruleSetName} onChange={event => setRuleSetName(event.target.value)} maxLength={80} placeholder="Name this rule set" aria-label="Rule set name" style={{ ...field(C), flex: "1 1 190px" }} />
        <button onClick={saveCurrentRuleSet} disabled={!rules.length} style={{ padding: "8px 11px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, opacity: rules.length ? 1 : .5 }}>Save current rules</button>
        <label style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Import JSON<input type="file" accept=".json,application/json" onChange={event => previewRuleSetImport(event.target.files?.[0] || null)} style={{ display: "none" }} /></label>
      </div>
      {importPreview && <div style={{ marginTop: 12, padding: 11, border: "1px solid " + C.border, borderRadius: 8, background: C.surface }}>
        <strong style={{ fontSize: 12 }}>Import preview · {importPreview.name}</strong><p style={muted(C)}>{importPreview.rules.length} rules · {importPreview.fileName}. Import creates a new library entry and never overwrites an existing rule set.</p>
        {importPreview.missingColumns.length > 0 ? <div style={{ display: "grid", gap: 7, marginTop: 8 }}><p style={muted(C)}>Some referenced columns are not present in the current CSV. Map each one, or cancel and import after loading the intended dataset.</p>{importPreview.missingColumns.map(column => <label key={column} style={{ display: "grid", gridTemplateColumns: "minmax(100px, 1fr) minmax(150px, 2fr)", gap: 8, alignItems: "center", fontSize: 11 }}>{column}<select value={columnMap[column] || ""} onChange={event => setColumnMap(previous => ({ ...previous, [column]: event.target.value }))} style={field(C)}><option value="">Select matching column</option>{(dataset?.headers || []).map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div> : <p style={muted(C)}>Column references are compatible with the current dataset, or will be checked when a dataset is loaded.</p>}
        <div style={{ display: "flex", gap: 7, marginTop: 10 }}><button onClick={confirmRuleSetImport} disabled={ruleSets.length >= 50 || importPreview.missingColumns.some(column => !columnMap[column])} style={{ padding: "7px 10px", border: 0, borderRadius: 6, background: C.accent, color: "#fff", cursor: "pointer", opacity: ruleSets.length >= 50 || importPreview.missingColumns.some(column => !columnMap[column]) ? .5 : 1 }}>Add to library</button><button onClick={() => { setImportPreview(null); setColumnMap({}); }} style={{ padding: "7px 10px", border: "1px solid " + C.border, borderRadius: 6, background: C.surface, color: C.text, cursor: "pointer" }}>Cancel</button></div>
      </div>}
      {ruleSets.length ? <div style={{ display: "grid", gap: 7, marginTop: 12 }}>{ruleSets.map(savedSet => <div key={savedSet.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 9, border: "1px solid " + C.border, borderRadius: 8 }}>
        <div style={{ flex: 1, minWidth: 150 }}><strong style={{ fontSize: 11 }}>{savedSet.name}</strong><div style={muted(C)}>{savedSet.rules.length} rules · updated {savedSet.updatedAt ? new Date(savedSet.updatedAt).toLocaleDateString() : "date unavailable"}</div></div>
        <button onClick={() => loadRuleSet(savedSet)} style={{ padding: "6px 9px", border: "1px solid " + C.border, borderRadius: 6, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10 }}>Load</button>
        <button onClick={() => downloadJson(createRuleSetExport(savedSet), savedSet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-rules.json")} style={{ padding: "6px 9px", border: "1px solid " + C.border, borderRadius: 6, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10 }}>Export</button>
        <button onClick={() => deleteRuleSet(savedSet.id)} style={{ padding: "6px 9px", border: "1px solid " + C.border, borderRadius: 6, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10 }}>Delete</button>
      </div>)}</div> : <p style={{ ...muted(C), marginTop: 12 }}>No named rule sets yet. Save your current rules to create the first reusable collection.</p>}
    </section>

    {dataset && <section style={panel(C)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><strong style={{ fontSize: 13 }}>Rule builder</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Add checks that represent your business expectations.</p></div>
        <button onClick={addRecommendedRules} style={{ padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Add required rule for every column</button>
      </div>

      {profile && <div style={{ marginTop: 14, padding: 12, border: "1px solid " + C.border, borderRadius: 9, background: C.surface }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div><strong style={{ fontSize: 12 }}>Profile-informed rule suggestions</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Based on missing values, candidate keys and low-cardinality categories. Review each suggestion before adding it.</p></div>
          <button onClick={addAllProfileSuggestions} disabled={!profileSuggestions.some(item => !rules.some(rule => rule.type === item.type && rule.column === item.column))} style={{ padding: "7px 10px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Add all new suggestions</button>
        </div>
        {profileSuggestions.length ? <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
          {profileSuggestions.map(item => {
            const exists = rules.some(rule => rule.type === item.type && rule.column === item.column);
            return <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", border: "1px solid " + C.border, borderRadius: 8, padding: 9 }}>
              <div style={{ flex: 1, minWidth: 190 }}><strong style={{ fontSize: 11 }}>{item.name}</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>{item.rationale}</p></div>
              <button disabled={exists} onClick={() => addProfileSuggestion(item)} style={{ padding: "6px 9px", border: "1px solid " + C.border, borderRadius: 6, background: C.surface, color: C.text, cursor: exists ? "default" : "pointer", fontSize: 10, opacity: exists ? .5 : 1 }}>{exists ? "Already added" : "Add draft rule"}</button>
            </div>;
          })}
        </div> : <p style={muted(C)}>No profile-based suggestions for this dataset. You can still create rules manually.</p>}
        <p style={{ ...muted(C), margin: "9px 0 0" }}>These are heuristic drafts, not approved business rules. Observed categories may be incomplete, and candidate-key uniqueness must be confirmed with the data owner.</p>
      </div>}

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
        <strong style={{ fontSize: 14 }}>Data quality dashboard</strong>
        <p style={muted(C)}>Executive overview, issue prioritisation and local run history for {result.fileName}.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9 }}>
          <Metric C={C} label="Quality score" value={result.qualityPercentage + "%"} tone={result.qualityPercentage >= 95 ? "#0D9B3A" : result.qualityPercentage >= 85 ? "#C47A12" : "#D64550"} />
          <Metric C={C} label="Rows flagged" value={new Set(result.issues.map(issue => issue.rowNumber)).size} />
          <Metric C={C} label="Critical errors" value={result.errors} tone="#D64550" />
          <Metric C={C} label="Warnings" value={result.warnings} tone="#C47A12" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
          <div>
            <strong style={{ fontSize: 12 }}>Recommended actions</strong>
            {[...result.ruleResults].filter(item => item.failed > 0).sort((a, b) => (b.severity === "error") - (a.severity === "error") || b.failed - a.failed).slice(0, 5).map(item => {
              const advice = item.type === "required" ? "Review source completeness and make the field mandatory where appropriate." : item.type === "unique" ? "Investigate duplicate business keys and confirm the expected data grain." : item.type === "allowedValues" ? "Align category values with the approved reference list." : item.type === "numericRange" ? "Check units, sign conventions and source calculations." : item.type === "dateRange" ? "Verify date format and the allowed reporting period." : "Confirm the expected relationship and comparison between these columns.";
              return <div key={item.ruleId} style={{ border: "1px solid " + C.border, borderRadius: 8, padding: 9, marginTop: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 11 }}>{item.ruleName}</strong><span style={{ color: item.severity === "error" ? "#D64550" : "#C47A12", fontSize: 10 }}>{item.failed} failed</span></div>
                <p style={{ ...muted(C), margin: "4px 0 0" }}>{advice}</p>
              </div>;
            })}
            {!result.ruleResults.some(item => item.failed > 0) && <p style={muted(C)}>No failed checks. Continue periodic validation.</p>}
          </div>
          <div>
            <strong style={{ fontSize: 12 }}>Quality history</strong>
            <p style={muted(C)}>Previous runs for this filename, saved locally.</p>
            <div style={{ display: "flex", alignItems: "end", gap: 6, height: 105 }}>
              {history.filter(item => item.fileName === result.fileName).slice(0, 7).reverse().map((item, index) => <div key={item.timestamp + index} title={item.timestamp} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 9 }}>{item.qualityPercentage}%</span><div style={{ width: "100%", height: Math.max(4, item.qualityPercentage) + "%", background: item.qualityPercentage >= 95 ? "#0D9B3A" : item.qualityPercentage >= 85 ? "#C47A12" : "#D64550", borderRadius: "4px 4px 0 0" }} />
              </div>)}
              <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center", gap: 3 }}><span style={{ fontSize: 9 }}>{result.qualityPercentage}%</span><div style={{ width: "100%", height: Math.max(4, result.qualityPercentage) + "%", background: C.accent, borderRadius: "4px 4px 0 0" }} /></div>
            </div>
            <p style={muted(C)}>{history.filter(item => item.fileName === result.fileName).length} previous run(s). At least two runs are needed to interpret a trend.</p>
          </div>
        </div>
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
