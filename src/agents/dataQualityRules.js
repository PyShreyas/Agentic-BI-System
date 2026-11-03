const RULE_TYPES = [
  { value: "required", label: "Required value" },
  { value: "unique", label: "Unique value" },
  { value: "allowedValues", label: "Allowed values" },
  { value: "numericRange", label: "Numeric range" },
  { value: "dateRange", label: "Date range" },
  { value: "compareColumns", label: "Compare two columns" }
];

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

function parseFiniteNumber(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseStrictDate(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function validateRuleConfiguration(rule, headers) {
  if (!rule || !RULE_TYPES.some(type => type.value === rule.type)) return "Choose a supported rule type.";
  if (!headers.includes(rule.column)) return "Choose a column that exists in the uploaded dataset.";
  if (rule.type === "allowedValues" && !(rule.allowedValues || []).length) return "Enter at least one allowed value.";
  if (rule.type === "numericRange") {
    if (rule.min !== "" && rule.min != null && parseFiniteNumber(rule.min) === null) return "Minimum must be a valid number.";
    if (rule.max !== "" && rule.max != null && parseFiniteNumber(rule.max) === null) return "Maximum must be a valid number.";
    if ((rule.min === "" || rule.min == null) && (rule.max === "" || rule.max == null)) return "Enter a minimum, maximum or both.";
    if (rule.min !== "" && rule.max !== "" && Number(rule.min) > Number(rule.max)) return "Minimum cannot exceed maximum.";
  }
  if (rule.type === "dateRange") {
    if (rule.minDate && !parseStrictDate(rule.minDate)) return "Minimum date must use YYYY-MM-DD.";
    if (rule.maxDate && !parseStrictDate(rule.maxDate)) return "Maximum date must use YYYY-MM-DD.";
    if (!rule.minDate && !rule.maxDate) return "Enter a start date, end date or both.";
    if (rule.minDate && rule.maxDate && rule.minDate > rule.maxDate) return "Start date cannot be after end date.";
  }
  if (rule.type === "compareColumns") {
    if (!headers.includes(rule.compareColumn)) return "Choose a second column that exists in the dataset.";
    if (rule.column === rule.compareColumn) return "Choose two different columns.";
    if (!["equals", "notEquals", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"].includes(rule.operator)) return "Choose a valid comparison operator.";
  }
  return "";
}

function validateDatasetRules(dataset, rules) {
  if (!dataset || !Array.isArray(dataset.records) || !Array.isArray(dataset.headers)) {
    throw new Error("A valid parsed CSV dataset is required.");
  }
  if (!dataset.records.length) throw new Error("The dataset has no data rows.");
  const activeRules = (rules || []).filter(rule => rule.enabled !== false);
  const issues = [];
  const ruleResults = activeRules.map(rule => {
    const configurationError = validateRuleConfiguration(rule, dataset.headers);
    if (configurationError) throw new Error((rule.name || rule.type) + ": " + configurationError);
    const duplicateValues = new Set();
    if (rule.type === "unique") {
      const counts = new Map();
      dataset.records.forEach(record => {
        const value = String(record[rule.column] ?? "").trim();
        if (!isBlank(value)) counts.set(value, (counts.get(value) || 0) + 1);
      });
      counts.forEach((count, value) => { if (count > 1) duplicateValues.add(value); });
    }
    const allowed = new Set((rule.allowedValues || []).map(value => rule.caseInsensitive ? value.toLocaleLowerCase() : value));
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    dataset.records.forEach(record => {
      const raw = record[rule.column];
      const value = String(raw ?? "").trim();
      let valid = true;
      let skip = false;
      let message = "";
      switch (rule.type) {
        case "required":
          valid = !isBlank(raw);
          message = "Value is required.";
          break;
        case "unique":
          skip = isBlank(raw);
          valid = skip || !duplicateValues.has(value);
          message = "Value appears more than once.";
          break;
        case "allowedValues": {
          skip = isBlank(raw) && rule.allowBlank === true;
          const candidate = rule.caseInsensitive ? value.toLocaleLowerCase() : value;
          valid = skip || (!isBlank(raw) && allowed.has(candidate));
          message = "Value is not in the allowed list.";
          break;
        }
        case "numericRange": {
          skip = isBlank(raw);
          const number = parseFiniteNumber(raw);
          valid = skip || (number !== null &&
            (rule.min === "" || rule.min == null || number >= Number(rule.min)) &&
            (rule.max === "" || rule.max == null || number <= Number(rule.max)));
          message = number === null && !skip ? "Value is not a valid number." : "Value is outside the configured numeric range.";
          break;
        }
        case "dateRange": {
          skip = isBlank(raw);
          const date = parseStrictDate(raw);
          valid = skip || (date !== null && (!rule.minDate || date >= rule.minDate) && (!rule.maxDate || date <= rule.maxDate));
          message = date === null && !skip ? "Date must be valid and use YYYY-MM-DD." : "Date is outside the configured date range.";
          break;
        }
        case "compareColumns": {
          const otherRaw = record[rule.compareColumn];
          skip = isBlank(raw) || isBlank(otherRaw);
          const left = String(raw ?? "").trim();
          const right = String(otherRaw ?? "").trim();
          const leftNumber = parseFiniteNumber(left);
          const rightNumber = parseFiniteNumber(right);
          let comparison;
          if (["greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"].includes(rule.operator)) {
            if (leftNumber === null || rightNumber === null) {
              valid = skip;
            } else {
              comparison = leftNumber - rightNumber;
            }
          } else {
            comparison = rule.caseInsensitive ? left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase()) : left.localeCompare(right);
          }
          if (!skip && comparison !== undefined) {
            valid = rule.operator === "equals" ? comparison === 0 :
              rule.operator === "notEquals" ? comparison !== 0 :
              rule.operator === "greaterThan" ? comparison > 0 :
              rule.operator === "lessThan" ? comparison < 0 :
              rule.operator === "greaterOrEqual" ? comparison >= 0 : comparison <= 0;
          }
          message = "Column comparison condition was not met.";
          break;
        }
        default:
          valid = false;
      }
      if (skip) {
        skipped += 1;
      } else if (valid) {
        passed += 1;
      } else {
        failed += 1;
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity || "error",
          column: rule.column,
          rowNumber: record.__rowNumber ?? "",
          value: raw ?? "",
          compareColumn: rule.compareColumn || "",
          compareValue: rule.compareColumn ? record[rule.compareColumn] ?? "" : "",
          message
        });
      }
    });
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      column: rule.column,
      severity: rule.severity || "error",
      passed,
      failed,
      skipped,
      passPercentage: passed + failed ? Math.round((passed / (passed + failed)) * 1000) / 10 : 100
    };
  });
  const errors = issues.filter(issue => issue.severity === "error").length;
  const warnings = issues.length - errors;
  const checked = ruleResults.reduce((sum, item) => sum + item.passed + item.failed, 0);
  const passed = ruleResults.reduce((sum, item) => sum + item.passed, 0);
  return {
    fileName: dataset.fileName || "dataset.csv",
    rowCount: dataset.records.length,
    rulesEvaluated: ruleResults.length,
    passed,
    failed: issues.length,
    errors,
    warnings,
    skipped: ruleResults.reduce((sum, item) => sum + item.skipped, 0),
    qualityPercentage: checked ? Math.round((passed / checked) * 1000) / 10 : 100,
    ruleResults,
    issues
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildValidationIssuesCsv(result) {
  const headers = ["rowNumber", "ruleName", "severity", "column", "value", "compareColumn", "compareValue", "message"];
  return [headers, ...(result?.issues || []).map(issue => headers.map(header => issue[header]))]
    .map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function buildValidationSummaryCsv(result) {
  const headers = ["ruleName", "type", "column", "severity", "passed", "failed", "skipped", "passPercentage"];
  return [headers, ...(result?.ruleResults || []).map(item => headers.map(header => item[header]))]
    .map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export {
  RULE_TYPES,
  validateRuleConfiguration,
  validateDatasetRules,
  buildValidationIssuesCsv,
  buildValidationSummaryCsv
};
