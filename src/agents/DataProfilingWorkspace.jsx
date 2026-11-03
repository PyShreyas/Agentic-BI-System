import { useMemo, useState } from "react";
import { buildProfileCsv, profileDataset, readProfileCsvFile } from "./dataProfiling";

const panel = C => ({ background: C.bg, border: "1px solid " + C.border, borderRadius: 10, padding: 14 });
const muted = C => ({ color: C.textMuted, fontSize: 12, lineHeight: 1.6 });
const field = C => ({ width: "100%", boxSizing: "border-box", padding: 9, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "inherit" });

function Metric({ label, value, C, hint }) {
  return <div style={{ ...panel(C), padding: 12 }}>
    <div style={{ ...muted(C), fontSize: 10, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: C.accent, marginTop: 3 }}>{value}</div>
    {hint && <div style={{ ...muted(C), fontSize: 10 }}>{hint}</div>}
  </div>;
}

function ProfileBar({ value, C, tone }) {
  return <div style={{ height: 6, borderRadius: 10, background: C.border, overflow: "hidden", minWidth: 65 }}>
    <div style={{ height: "100%", width: Math.max(0, Math.min(100, value || 0)) + "%", background: tone || C.accent, borderRadius: 10 }} />
  </div>;
}

export default function DataProfilingWorkspace({ C }) {
  const [dataset, setDataset] = useState(null);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedColumn, setExpandedColumn] = useState("");

  const visibleColumns = useMemo(() => (profile?.columns || []).filter(column =>
    column.columnName.toLowerCase().includes(search.toLowerCase()) &&
    (typeFilter === "all" || column.dataType === typeFilter)
  ), [profile, search, typeFilter]);

  const loadFile = async file => {
    if (!file) return;
    setBusy(true);
    setError("");
    setProfile(null);
    setDataset(null);
    try {
      const parsed = await readProfileCsvFile(file);
      setDataset(parsed);
      setProfile(profileDataset(parsed));
    } catch (loadError) {
      setError(loadError.message || "Unable to profile this CSV file.");
    } finally {
      setBusy(false);
    }
  };

  const exportProfile = () => {
    if (!profile) return;
    const url = URL.createObjectURL(new Blob([buildProfileCsv(profile)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "data-profile-" + profile.fileName.replace(/\.csv$/i, "") + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const typeOptions = ["all", "numeric", "text", "date", "boolean", "empty"];

  return <div style={{ display: "grid", gap: 14 }}>
    <section style={panel(C)}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>SQL Agent · Data profiling & statistical analysis</strong>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0D9B3A", background: "#0D9B3A18", borderRadius: 20, padding: "4px 8px" }}>Browser-local processing</span>
      </div>
      <p style={muted(C)}>Upload one CSV to inspect completeness, data types, distinct values, distributions, numeric statistics and potential outliers. The file stays in this browser and is not sent to a server.</p>
      <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 700, marginTop: 12 }}>
        Select CSV dataset
        <input type="file" accept=".csv,text/csv" onChange={event => loadFile(event.target.files?.[0] || null)} style={{ ...field(C), fontSize: 11 }} />
        <span style={{ ...muted(C), fontWeight: 400 }}>{dataset ? dataset.fileName + " · " + dataset.rowCount.toLocaleString() + " rows · " + dataset.headers.length + " columns" : "CSV only · maximum 10 MB · no backend upload"}</span>
      </label>
      {busy && <p style={muted(C)}>Profiling dataset…</p>}
      {error && <p role="alert" style={{ color: "#D64550", fontSize: 12 }}>{error}</p>}
    </section>

    {profile && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 9 }}>
        <Metric C={C} label="Rows" value={profile.rowCount.toLocaleString()} />
        <Metric C={C} label="Columns" value={profile.columnCount.toLocaleString()} />
        <Metric C={C} label="Completeness" value={profile.completenessPercentage + "%"} hint={profile.nullCells.toLocaleString() + " blank cells"} />
        <Metric C={C} label="Profile score" value={profile.qualityScore + "/100"} hint="Heuristic indicator, not certification" />
        <Metric C={C} label="Potential key columns" value={profile.candidateKeys.length} hint="Unique and non-null in this file" />
      </section>

      <section style={panel(C)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 13 }}>Column profile</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Select a column to inspect statistics and frequent values.</p></div>
          <button onClick={exportProfile} style={{ padding: "8px 12px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Export profile CSV</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 12 }}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search columns…" style={field(C)} />
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} style={field(C)}>
            {typeOptions.map(type => <option key={type} value={type}>{type === "all" ? "All detected types" : type}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          {visibleColumns.map(column => {
            const expanded = expandedColumn === column.columnName;
            return <div key={column.columnName} style={{ border: "1px solid " + C.border, borderRadius: 9, overflow: "hidden" }}>
              <button onClick={() => setExpandedColumn(expanded ? "" : column.columnName)} style={{ width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "minmax(110px, 1.4fr) minmax(65px, .7fr) minmax(80px, 1fr) minmax(80px, 1fr) 24px", gap: 9, alignItems: "center", padding: 11, border: 0, background: C.surface, color: C.text, cursor: "pointer" }}>
                <span style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{column.columnName}</strong><span style={{ ...muted(C), fontSize: 10 }}>{column.dataType}</span></span>
                <span style={{ fontSize: 11 }}>{column.nullCount.toLocaleString()} null</span>
                <span style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 10 }}>{column.nullPercentage}% missing</span><ProfileBar value={column.nullPercentage} C={C} tone={column.nullPercentage > 20 ? "#D97706" : C.accent} /></span>
                <span style={{ fontSize: 10, color: C.textMuted }}>{column.distinctCount.toLocaleString()} distinct</span>
                <span style={{ fontSize: 15 }}>{expanded ? "−" : "+"}</span>
              </button>
              {expanded && <div style={{ padding: 12, borderTop: "1px solid " + C.border, background: C.bg }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 8 }}>
                  {[
                    ["Non-null", column.nonNullCount], ["Duplicate value rows", column.duplicateValueRows],
                    ["Uniqueness", column.uniquenessPercentage + "%"],
                    ...(column.dataType === "numeric" ? [["Minimum", column.min], ["Maximum", column.max], ["Mean", column.mean], ["Median", column.median], ["Std. deviation", column.standardDeviation], ["Q1 / Q3", column.q1 + " / " + column.q3], ["IQR outliers", column.iqrOutlierCount]] :
                      column.dataType === "date" ? [["Earliest", column.min], ["Latest", column.max]] :
                      [["Min length", column.minLength], ["Max length", column.maxLength]])
                  ].map(([label, value]) => <div key={label} style={{ padding: 9, borderRadius: 7, background: C.surface, border: "1px solid " + C.border }}><div style={{ ...muted(C), fontSize: 10 }}>{label}</div><strong style={{ fontSize: 12 }}>{value ?? "—"}</strong></div>)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 11 }}>Most frequent values</strong>
                  {column.topValues.length ? column.topValues.map(item => <div key={item.value} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 1fr) 42px minmax(70px, .7fr)", gap: 8, alignItems: "center", marginTop: 7, fontSize: 11 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</span><span>{item.count}</span><ProfileBar value={item.percentage} C={C} /></div>) : <p style={muted(C)}>No non-blank values.</p>}
                  {column.sampleValues.length > 0 && <p style={muted(C)}>Sample: {column.sampleValues.join(" · ")}</p>}
                </div>
              </div>}
            </div>;
          })}
          {!visibleColumns.length && <p style={muted(C)}>No columns match the selected filters.</p>}
        </div>
      </section>

      <section style={panel(C)}>
        <strong style={{ fontSize: 13 }}>Potential key candidates</strong>
        <p style={muted(C)}>These columns are unique and non-null across the uploaded rows. They are candidates only; confirm business meaning before using them as keys.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {profile.candidateKeys.length ? profile.candidateKeys.map(key => <span key={key} style={{ border: "1px solid " + C.border, borderRadius: 7, padding: "6px 9px", fontSize: 11 }}>{key}</span>) : <span style={muted(C)}>No single-column candidate key found.</span>}
        </div>
      </section>
    </>}

    <p style={{ ...muted(C), margin: 0 }}>Method notes: blanks are empty or whitespace-only cells; numeric/date detection is conservative; outliers use the 1.5×IQR rule. The profile score is a simple completeness/type-detection heuristic, not a formal data-quality certification. Correlation, statistical significance and business-rule validation are not calculated.</p>
  </div>;
}
