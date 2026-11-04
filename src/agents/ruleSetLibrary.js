export const RULE_SET_SCHEMA_VERSION = 1;

const supportedRuleTypes = new Set([
  "required", "unique", "allowedValues", "numericRange", "dateRange", "compareColumns"
]);

function cloneRule(rule, index) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    throw new Error("Every rule must be a JSON object.");
  }
  if (!supportedRuleTypes.has(rule.type)) {
    throw new Error("Unsupported rule type at item " + (index + 1) + ".");
  }
  if (typeof rule.column !== "string" || !rule.column.trim()) {
    throw new Error("A target column is missing from rule " + (index + 1) + ".");
  }
  if (rule.type === "compareColumns" &&
      (typeof rule.compareColumn !== "string" || !rule.compareColumn.trim())) {
    throw new Error("A comparison column is missing from rule " + (index + 1) + ".");
  }
  return {
    ...rule,
    id: typeof rule.id === "string" && rule.id ? rule.id : "imported-rule-" + (index + 1),
    name: typeof rule.name === "string" && rule.name.trim() ? rule.name.trim() : "Imported rule " + (index + 1),
    severity: rule.severity === "warning" ? "warning" : "error",
    enabled: rule.enabled !== false,
    allowedValues: Array.isArray(rule.allowedValues) ? rule.allowedValues.map(String) : []
  };
}

export function createRuleSetExport(ruleSet) {
  if (!ruleSet || !Array.isArray(ruleSet.rules)) {
    throw new Error("A valid saved rule set is required for export.");
  }
  return JSON.stringify({
    format: "agentic-bi-data-quality-rule-set",
    schemaVersion: RULE_SET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    name: ruleSet.name,
    rules: ruleSet.rules
  }, null, 2);
}

export function parseRuleSetImport(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!parsed || parsed.format !== "agentic-bi-data-quality-rule-set") {
    throw new Error("This file is not an Agentic BI rule-set export.");
  }
  if (parsed.schemaVersion !== RULE_SET_SCHEMA_VERSION) {
    throw new Error("Unsupported rule-set version. Expected version " + RULE_SET_SCHEMA_VERSION + ".");
  }
  if (!Array.isArray(parsed.rules) || parsed.rules.length === 0) {
    throw new Error("The imported rule set does not contain any rules.");
  }
  if (parsed.rules.length > 500) {
    throw new Error("A rule set cannot contain more than 500 rules.");
  }
  const name = typeof parsed.name === "string" ? parsed.name.trim().slice(0, 80) : "";
  if (!name) throw new Error("The imported rule set needs a name.");
  return {
    name,
    rules: parsed.rules.map(cloneRule),
    sourceVersion: parsed.schemaVersion
  };
}

export function findRuleSetColumnReferences(rules) {
  const columns = new Set();
  (rules || []).forEach(rule => {
    if (rule?.column) columns.add(rule.column);
    if (rule?.type === "compareColumns" && rule.compareColumn) columns.add(rule.compareColumn);
  });
  return [...columns];
}

export function remapRuleSetColumns(rules, columnMap) {
  return (rules || []).map(rule => ({
    ...rule,
    column: columnMap[rule.column] || rule.column,
    ...(rule.type === "compareColumns"
      ? { compareColumn: columnMap[rule.compareColumn] || rule.compareColumn }
      : {})
  }));
}
