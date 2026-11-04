import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDataset } from "./reportBlueprint.js";

test("creates KPI and chart recommendations from detected field types", () => {
  const result = summarizeDataset({
    fileName: "orders.csv",
    headers: ["orderDate", "region", "revenue", "units"],
    records: [
      { orderDate: "2026-01-02", region: "North", revenue: "100", units: "2" },
      { orderDate: "2026-02-03", region: "South", revenue: "150", units: "3" },
      { orderDate: "2026-02-18", region: "North", revenue: "200", units: "4" }
    ]
  });
  assert.deepEqual(result.detectedFields.dates, ["orderDate"]);
  assert.ok(result.kpis.some(kpi => kpi.id === "sum-revenue" && kpi.value === 450));
  assert.ok(result.visuals.some(visual => visual.chartType === "Line chart"));
  assert.ok(result.visuals.some(visual => visual.chartType === "Bar chart"));
  assert.ok(result.visuals.some(visual => visual.chartType === "Scatter plot"));
});

test("flags incomplete data and handles datasets without chartable combinations", () => {
  const result = summarizeDataset({
    fileName: "notes.csv",
    headers: ["comment", "owner"],
    records: [{ comment: "A", owner: "" }, { comment: "B", owner: "Alex" }]
  });
  assert.ok(result.insights.some(insight => insight.title === "Review missing data"));
  assert.equal(result.visuals.length, 0);
  assert.ok(result.insights.some(insight => insight.title === "Limited chart combinations detected"));
});

test("rejects malformed dataset input", () => {
  assert.throws(() => summarizeDataset(null), /parsed CSV dataset/);
});
