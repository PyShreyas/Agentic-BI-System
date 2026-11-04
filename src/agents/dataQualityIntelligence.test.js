import test from "node:test";
import assert from "node:assert/strict";
import { analyzeQualityHistory } from "./dataQualityIntelligence.js";

test("identifies recurring failures and prioritises error severity", () => {
  const result = analyzeQualityHistory([
    { fileName: "orders.csv", qualityPercentage: 90, rowCount: 10, ruleFailures: [
      { ruleName: "PO required", column: "poNumber", type: "required", severity: "error", failed: 3 }
    ] },
    { fileName: "orders.csv", qualityPercentage: 88, rowCount: 10, ruleFailures: [
      { ruleName: "PO required", column: "poNumber", type: "required", severity: "error", failed: 2 },
      { ruleName: "Status list", column: "status", type: "allowedValues", severity: "warning", failed: 1 }
    ] }
  ]);
  assert.equal(result.recurringFailures.length, 1);
  assert.equal(result.recurringFailures[0].ruleName, "PO required");
  assert.equal(result.recurringFailures[0].runCount, 2);
  assert.equal(result.recurringFailures[0].totalFailed, 5);
});

test("compares scores only when row counts match", () => {
  const result = analyzeQualityHistory([
    { fileName: "orders.csv", qualityPercentage: 95, rowCount: 12 },
    { fileName: "orders.csv", qualityPercentage: 90, rowCount: 12 },
    { fileName: "orders.csv", qualityPercentage: 80, rowCount: 9 }
  ]);
  assert.equal(result.trends[0].delta, 5);
  assert.equal(result.trends[0].comparable, true);
});

test("handles empty or legacy snapshots safely", () => {
  const result = analyzeQualityHistory([{ fileName: "legacy.csv", qualityPercentage: 91, rowCount: 2 }]);
  assert.equal(result.snapshotCount, 1);
  assert.deepEqual(result.recurringFailures, []);
  assert.equal(result.trends[0].comparable, false);
});
