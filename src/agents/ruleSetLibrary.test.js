import test from "node:test";
import assert from "node:assert/strict";
import {
  createRuleSetExport,
  parseRuleSetImport,
  findRuleSetColumnReferences,
  remapRuleSetColumns
} from "./ruleSetLibrary.js";

const sampleRuleSet = {
  name: "Procurement checks",
  rules: [
    { id: "r1", name: "PO required", type: "required", column: "poNumber", severity: "error", enabled: true, allowedValues: [] },
    { id: "r2", name: "Delivery after order", type: "compareColumns", column: "deliveryDate", compareColumn: "orderDate", operator: "greaterOrEqual", severity: "warning", enabled: true, allowedValues: [] }
  ]
};

test("exports and imports a versioned rule set", () => {
  const imported = parseRuleSetImport(createRuleSetExport(sampleRuleSet));
  assert.equal(imported.name, sampleRuleSet.name);
  assert.equal(imported.rules.length, 2);
  assert.equal(imported.rules[1].compareColumn, "orderDate");
});

test("rejects unsupported formats and schema versions", () => {
  assert.throws(() => parseRuleSetImport(JSON.stringify({ format: "other", schemaVersion: 1, name: "x", rules: [] })), /not an Agentic BI/);
  assert.throws(() => parseRuleSetImport(JSON.stringify({ format: "agentic-bi-data-quality-rule-set", schemaVersion: 99, name: "x", rules: [] })), /Unsupported rule-set version/);
});

test("rejects invalid rule definitions", () => {
  const payload = { format: "agentic-bi-data-quality-rule-set", schemaVersion: 1, name: "Broken", rules: [{ type: "executeSql", column: "x" }] };
  assert.throws(() => parseRuleSetImport(JSON.stringify(payload)), /Unsupported rule type/);
});

test("finds and remaps both target and comparison columns", () => {
  const refs = findRuleSetColumnReferences(sampleRuleSet.rules);
  assert.deepEqual(refs, ["poNumber", "deliveryDate", "orderDate"]);
  const mapped = remapRuleSetColumns(sampleRuleSet.rules, { poNumber: "purchaseOrder", deliveryDate: "deliveredOn", orderDate: "orderedOn" });
  assert.equal(mapped[0].column, "purchaseOrder");
  assert.equal(mapped[1].column, "deliveredOn");
  assert.equal(mapped[1].compareColumn, "orderedOn");
});
