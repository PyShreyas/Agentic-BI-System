import { useMemo, useState } from "react";
import {
  buildReconciliationCsv,
  findDuplicates,
  readCsvFile,
  reconcileDatasets
} from "./dataReconciliation";

const panel = C => ({ background: C.bg, border: "1px solid " + C.border, borderRadius: 10, padding: 14 });
const muted = C => ({ color: C.textMuted, fontSize: 12, lineHeight: 1.6 });
const field = C => ({ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "inherit" });

function Metric({ label, value, C, tone }) {
  return <div style={{ ...panel(C), padding: 12 }}>
    <div style={{ ...muted(C), fontSize: 10, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: tone || C.accent, marginTop: 3 }}>{value}</div>
  </div>;
}

function FilePicker({ label, dataset, onChange, C }) {
  return <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 700 }}>
    {label}
    <input type="file" accept=".csv,text/csv" onChange={event => onChange(event.target.files?.[0] || null)} style={{ ...field(C), fontSize: 11 }} />
    <span style={{ ...muted(C), fontWeight: 400 }}>{dataset ? dataset.fileName + " · " + dataset.rowCount.toLocaleString() + " rows · " + dataset.headers.length + " columns" : "CSV only · maximum 10 MB · processed in this browser"}</span>
  </label>;
}

function SampleTable({ title, rows, columns, C, emptyText }) {
  return <section style={panel(C)}>
    <strong style={{ fontSize: 13 }}>{title} <span style={{ color: C.textMuted, fontWeight: 500 }}>({rows.length})</span></strong>
    {!rows.length ? <p style={muted(C)}>{emptyText || "No records in this category."}</p> :
      <div style={{ overflowX: "auto", marginTop: 9 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 430 }}>
          <thead><tr>{columns.map(column => <th key={column} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid " + C.border, color: C.textMuted }}>{column}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 8).map((record, index) => <tr key={index}>{columns.map(column => <td key={column} style={{ padding: 8, borderBottom: "1px solid " + C.border, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(record[column] ?? "") || "—"}</td>)}</tr>)}</tbody>
        </table>
        {rows.length > 8 && <p style={muted(C)}>Showing first 8 rows. Export the reconciliation results for the complete exception list.</p>}
      </div>}
  </section>;
}

export default function DataReconciliationWorkspace({ C, mode = "Reconciliation" }) {
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const [compareColumns, setCompareColumns] = useState([]);
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const commonColumns = useMemo(() => left && right
    ? left.headers.filter(column => right.headers.includes(column) && column !== leftKey)
    : [], [left, right, leftKey]);
  const duplicateLeft = useMemo(() => reviewed && left && leftKey ? findDuplicates(left, [leftKey], { caseInsensitive }) : null, [reviewed, left, leftKey, caseInsensitive]);
  const duplicateRight = useMemo(() => reviewed && right && rightKey ? findDuplicates(right, [rightKey], { caseInsensitive }) : null, [reviewed, right, rightKey, caseInsensitive]);
  const result = useMemo(() => reviewed && left && right && leftKey && rightKey
    ? reconcileDatasets(left, right, leftKey, rightKey, compareColumns, { caseInsensitive })
    : null, [reviewed, left, right, leftKey, rightKey, compareColumns, caseInsensitive]);

  const loadFile = async (file, setter, keySetter, otherDataset) => {
    if (!file) return;
    setBusy(file.name);
    setError("");
    setReviewed(false);
    try {
      const dataset = await readCsvFile(file);
      setter(dataset);
      keySetter(dataset.headers.find(header => otherDataset?.headers.includes(header)) || dataset.headers[0]);
      setCompareColumns([]);
    } catch (readError) {
      setError(readError.message || "Unable to read this CSV file.");
    } finally {
      setBusy("");
    }
  };

  const runReview = () => {
    if (!left || !right) return setError("Upload both CSV files before running the analysis.");
    if (!leftKey || !rightKey) return setError("Select a business key column for each file.");
    const selected = compareColumns.filter(column => left.headers.includes(column) && right.headers.includes(column));
    setCompareColumns(selected);
    setError("");
    setReviewed(true);
  };

  const exportResults = () => {
    if (!result) return;
    const csv = buildReconciliationCsv(result, leftKey, compareColumns);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "data-reconciliation-results.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleColumn = column => {
    setCompareColumns(previous => previous.includes(column) ? previous.filter(item => item !== column) : [...previous, column]);
    setReviewed(false);
  };
  const isDuplicateMode = mode === "Duplicate Analysis";

  return <div style={{ display: "grid", gap: 14 }}>
    <section style={panel(C)}>
      <strong style={{ fontSize: 14 }}>SQL Agent · {isDuplicateMode ? "Duplicate key analysis" : "Data reconciliation"}</strong>
      <p style={muted(C)}>Compare two CSV extracts using a business key. Duplicate groups, unmatched keys and selected-column value differences are calculated locally in your browser. No file is uploaded to a server.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 12 }}>
        <FilePicker label="Source A · baseline / expected" dataset={left} C={C} onChange={file => loadFile(file, setLeft, setLeftKey, right)} />
        <FilePicker label="Source B · comparison" dataset={right} C={C} onChange={file => loadFile(file, setRight, setRightKey, left)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 14 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 700 }}>Source A business key
          <select value={leftKey} onChange={event => { setLeftKey(event.target.value); setReviewed(false); }} disabled={!left} style={field(C)}>
            {!left && <option value="">Upload source A first</option>}
            {left?.headers.map(header => <option key={header} value={header}>{header}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 11, fontWeight: 700 }}>Source B business key
          <select value={rightKey} onChange={event => { setRightKey(event.target.value); setReviewed(false); }} disabled={!right} style={field(C)}>
            {!right && <option value="">Upload source B first</option>}
            {right?.headers.map(header => <option key={header} value={header}>{header}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginTop: 12, color: C.text }}>
        <input type="checkbox" checked={caseInsensitive} onChange={event => { setCaseInsensitive(event.target.checked); setReviewed(false); }} />
        Ignore letter case when matching keys
      </label>
      {!isDuplicateMode && <div style={{ marginTop: 13 }}>
        <strong style={{ fontSize: 11 }}>Columns to compare</strong>
        <p style={{ ...muted(C), margin: "3px 0 8px" }}>Only columns present in both files are listed. The selected business key is excluded.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {commonColumns.map(column => <label key={column} style={{ display: "flex", gap: 6, alignItems: "center", border: "1px solid " + C.border, borderRadius: 7, padding: "6px 8px", fontSize: 11 }}>
            <input type="checkbox" checked={compareColumns.includes(column)} onChange={() => toggleColumn(column)} />{column}
          </label>)}
          {left && right && !commonColumns.length && <span style={muted(C)}>No common non-key columns detected.</span>}
        </div>
      </div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button onClick={runReview} disabled={!left || !right || Boolean(busy)} style={{ padding: "9px 14px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, opacity: !left || !right ? .55 : 1 }}>Run {isDuplicateMode ? "duplicate analysis" : "reconciliation"}</button>
        <button onClick={() => { setLeft(null); setRight(null); setLeftKey(""); setRightKey(""); setCompareColumns([]); setReviewed(false); setError(""); }} style={{ padding: "9px 13px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Clear files</button>
        {result && <button onClick={exportResults} style={{ padding: "9px 13px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer" }}>Export exceptions CSV</button>}
      </div>
      {busy && <p style={muted(C)}>Reading {busy}…</p>}
      {error && <p role="alert" style={{ color: "#D64550", fontSize: 12, marginBottom: 0 }}>{error}</p>}
    </section>

    {!reviewed && <div style={{ ...panel(C), ...muted(C) }}>Upload both files, select the matching business key, choose comparison columns if needed, and run the analysis.</div>}

    {reviewed && duplicateLeft && duplicateRight && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 9 }}>
        <Metric C={C} label="Source A duplicate groups" value={duplicateLeft.duplicateGroups.length} tone={duplicateLeft.duplicateGroups.length ? "#C47A12" : "#0D9B3A"} />
        <Metric C={C} label="Source A extra duplicate rows" value={duplicateLeft.duplicateRows} />
        <Metric C={C} label="Source B duplicate groups" value={duplicateRight.duplicateGroups.length} tone={duplicateRight.duplicateGroups.length ? "#C47A12" : "#0D9B3A"} />
        <Metric C={C} label="Source B extra duplicate rows" value={duplicateRight.duplicateRows} />
      </section>
      {isDuplicateMode ? <>
        <SampleTable title="Duplicate keys in source A" rows={duplicateLeft.duplicateGroups.map(group => ({ [leftKey]: group.records[0][leftKey], occurrences: group.records.length, extraRows: group.extraRows }))} columns={[leftKey, "occurrences", "extraRows"]} C={C} />
        <SampleTable title="Duplicate keys in source B" rows={duplicateRight.duplicateGroups.map(group => ({ [rightKey]: group.records[0][rightKey], occurrences: group.records.length, extraRows: group.extraRows }))} columns={[rightKey, "occurrences", "extraRows"]} C={C} />
      </> : result && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 9 }}>
          <Metric C={C} label="Matched keys" value={result.counts.matched} tone="#0D9B3A" />
          <Metric C={C} label="Only in source A" value={result.counts.onlyLeft} tone={result.counts.onlyLeft ? "#C47A12" : "#0D9B3A"} />
          <Metric C={C} label="Only in source B" value={result.counts.onlyRight} tone={result.counts.onlyRight ? "#C47A12" : "#0D9B3A"} />
          <Metric C={C} label="Matched keys with differences" value={result.counts.changed} tone={result.counts.changed ? "#D64550" : "#0D9B3A"} />
        </section>
        <section style={{ ...panel(C), ...muted(C) }}>Matched records are compared using the first occurrence of each key. Duplicate keys are reported separately; resolve them before treating reconciliation counts as final.</section>
        <SampleTable title="Records only in source A" rows={result.onlyLeft} columns={[leftKey, "__rowNumber"]} C={C} />
        <SampleTable title="Records only in source B" rows={result.onlyRight} columns={[rightKey, "__rowNumber"]} C={C} />
        <SampleTable title="Matched records with value differences" rows={result.differences.map(item => ({ [leftKey]: item.key, changedColumns: item.changedColumns.join(", "), sourceARow: item.leftRecord.__rowNumber, sourceBRow: item.rightRecord.__rowNumber }))} columns={[leftKey, "changedColumns", "sourceARow", "sourceBRow"]} C={C} />
      </>}
    </>}
    <p style={{ ...muted(C), margin: 0 }}>Limitations: CSV only (10 MB per file); one business key column per source; exact text comparison for selected fields; duplicate keys use the first row for matching. This is an offline data-quality aid, not a substitute for source-system validation or a governed reconciliation process.</p>
  </div>;
}
