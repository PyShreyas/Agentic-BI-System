import { useState } from "react";
import { readReportCsvFile, summarizeDataset } from "./reportBlueprint";

const panel = C => ({ background: C.bg, border: "1px solid " + C.border, borderRadius: 10, padding: 14 });
const muted = C => ({ color: C.textMuted, fontSize: 12, lineHeight: 1.6 });
const field = C => ({ width: "100%", boxSizing: "border-box", padding: 9, borderRadius: 8, border: "1px solid " + C.border, background: C.surface, color: C.text, font: "inherit" });

function Metric({ label, value, C, hint }) {
  return <div style={{ ...panel(C), padding: 12 }}>
    <div style={{ ...muted(C), fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: C.accent, marginTop: 3 }}>{value}</div>
    {hint && <div style={{ ...muted(C), fontSize: 10 }}>{hint}</div>}
  </div>;
}

export default function ReportAgentWorkspace({ C }) {
  const [dataset, setDataset] = useState(null);
  const [blueprint, setBlueprint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadFile = async file => {
    if (!file) return;
    setBusy(true);
    setError("");
    setDataset(null);
    setBlueprint(null);
    try {
      const parsed = await readReportCsvFile(file);
      setDataset(parsed);
      setBlueprint(summarizeDataset(parsed));
    } catch (loadError) {
      setError(loadError.message || "Unable to analyse this CSV file.");
    } finally {
      setBusy(false);
    }
  };

  const exportBlueprint = () => {
    if (!blueprint) return;
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "report-blueprint-" + blueprint.fileName.replace(/\.csv$/i, "") + ".json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div style={{ display: "grid", gap: 14 }}>
    <section style={panel(C)}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>Report Agent · Dataset intelligence & dashboard blueprint</strong>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0D9B3A", background: "#0D9B3A18", borderRadius: 20, padding: "4px 8px" }}>Browser-local</span>
      </div>
      <p style={muted(C)}>Upload a business dataset to generate KPI candidates, chart recommendations and data-review insights. Analysis runs in this browser; the CSV is not uploaded to a backend.</p>
      <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 700, marginTop: 12 }}>
        Select business dataset (CSV)
        <input type="file" accept=".csv,text/csv" onChange={event => loadFile(event.target.files?.[0] || null)} style={{ ...field(C), fontSize: 11 }} />
        <span style={{ ...muted(C), fontWeight: 400 }}>{dataset ? dataset.fileName + " · " + dataset.records.length.toLocaleString() + " rows · " + dataset.headers.length + " columns" : "CSV only · maximum 10 MB · no server upload"}</span>
      </label>
      {busy && <p style={muted(C)}>Analysing dataset…</p>}
      {error && <p role="alert" style={{ color: "#D64550", fontSize: 12 }}>{error}</p>}
    </section>

    {blueprint && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 9 }}>
        <Metric C={C} label="Rows analysed" value={blueprint.rowCount.toLocaleString()} />
        <Metric C={C} label="Fields" value={blueprint.columnCount} />
        <Metric C={C} label="Completeness" value={blueprint.completenessPercentage + "%"} hint="Non-blank cells" />
        <Metric C={C} label="KPI candidates" value={blueprint.kpis.length} />
        <Metric C={C} label="Visual suggestions" value={blueprint.visuals.length} />
      </section>

      <section style={panel(C)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: 13 }}>Dashboard blueprint</strong><p style={{ ...muted(C), margin: "3px 0 0" }}>Suggested starting point; validate metric definitions and business grain before implementation.</p></div>
          <button onClick={exportBlueprint} style={{ padding: "8px 12px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>Export blueprint JSON</button>
        </div>
        <h4 style={{ fontSize: 12, margin: "16px 0 8px" }}>KPI candidates</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
          {blueprint.kpis.map(kpi => <div key={kpi.id} style={{ border: "1px solid " + C.border, borderRadius: 8, padding: 11 }}>
            <div style={{ ...muted(C), fontSize: 10 }}>{kpi.label}</div>
            <strong style={{ display: "block", fontSize: 19, color: C.accent, margin: "4px 0" }}>{kpi.format === "percent" ? kpi.value + "%" : Number(kpi.value).toLocaleString()}</strong>
            <p style={{ ...muted(C), margin: 0, fontSize: 10 }}>{kpi.rationale}</p>
          </div>)}
        </div>
        <h4 style={{ fontSize: 12, margin: "18px 0 8px" }}>Recommended visuals</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {blueprint.visuals.map(visual => <div key={visual.id} style={{ border: "1px solid " + C.border, borderRadius: 8, padding: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 12 }}>{visual.title}</strong><span style={{ fontSize: 9, color: C.accent, fontWeight: 700 }}>{visual.chartType}</span></div>
            <p style={{ ...muted(C), margin: "7px 0 4px" }}>{visual.purpose}</p>
            <p style={{ ...muted(C), margin: 0, fontSize: 10 }}>X: {visual.xAxis} · Y: {visual.yAxis}</p>
            <p style={{ ...muted(C), margin: "5px 0 0", fontSize: 10 }}>{visual.reason}</p>
          </div>)}
          {!blueprint.visuals.length && <p style={muted(C)}>No obvious chart combinations detected. Review the field types and business meaning.</p>}
        </div>
      </section>

      <section style={panel(C)}>
        <strong style={{ fontSize: 13 }}>Data and reporting insights</strong>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {blueprint.insights.map((insight, index) => <div key={index} style={{ padding: 11, borderRadius: 8, background: C.surface, border: "1px solid " + C.border }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 12 }}>{insight.title}</strong><span style={{ fontSize: 10, color: insight.severity === "High" ? "#D64550" : C.textMuted, fontWeight: 700 }}>{insight.severity}</span></div>
            <p style={{ ...muted(C), margin: "5px 0 0" }}>{insight.detail}</p>
          </div>)}
          {!blueprint.insights.length && <p style={muted(C)}>No heuristic review flags were detected.</p>}
        </div>
      </section>

      <section style={panel(C)}>
        <strong style={{ fontSize: 13 }}>Detected field groups</strong>
        {Object.entries(blueprint.detectedFields).map(([type, names]) => <div key={type} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, padding: "8px 0", borderBottom: "1px solid " + C.border }}>
          <span style={{ ...muted(C), textTransform: "capitalize" }}>{type}</span>
          <span style={{ fontSize: 11 }}>{names.length ? names.join(", ") : "None detected"}</span>
        </div>)}
      </section>

      <section style={panel(C)}>
        <strong style={{ fontSize: 13 }}>Methodology and limitations</strong>
        <ul style={{ ...muted(C), paddingLeft: 18, marginBottom: 0 }}>{blueprint.methodology.map(note => <li key={note} style={{ marginTop: 5 }}>{note}</li>)}</ul>
      </section>
    </>}
  </div>;
}
