import { parseCsvText } from "./dataReconciliation.js";
import { profileDataset } from "./dataProfiling.js";

const MAX_REPORT_FILE_BYTES = 10 * 1024 * 1024;

function cleanName(value) {
  return String(value || "").trim();
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(value) {
  const text = String(value || "").trim();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function summarizeDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.records) || !Array.isArray(dataset.headers)) {
    throw new Error("A parsed CSV dataset is required.");
  }
  const profile = profileDataset(dataset);
  const columns = profile.columns;
  const numericColumns = columns.filter(column => column.dataType === "numeric");
  const dateColumns = columns.filter(column => column.dataType === "date");
  const categoricalColumns = columns.filter(column => column.dataType === "text" || column.dataType === "boolean");

  const kpis = [
    { id: "rowCount", label: "Records analysed", value: profile.rowCount, format: "number", rationale: "Total data rows in the uploaded file." },
    { id: "columnCount", label: "Fields available", value: profile.columnCount, format: "number", rationale: "Available columns for report analysis." },
    { id: "completeness", label: "Data completeness", value: profile.completenessPercentage, format: "percent", rationale: "Non-blank cells divided by all cells." }
  ];
  numericColumns.slice(0, 4).forEach(column => {
    const values = dataset.records.map(row => toNumber(row[column.columnName])).filter(value => value !== null);
    if (values.length) {
      const total = values.reduce((sum, value) => sum + value, 0);
      kpis.push({
        id: "sum-" + column.columnName,
        label: "Total " + column.columnName,
        value: round(total),
        format: "number",
        rationale: "Sum of " + values.length.toLocaleString() + " numeric values; confirm that summation is meaningful for this field."
      });
    }
  });

  const visuals = [];
  if (dateColumns.length && numericColumns.length) {
    visuals.push({
      id: "time-trend",
      title: numericColumns[0].columnName + " over time",
      chartType: "Line chart",
      xAxis: dateColumns[0].columnName,
      yAxis: numericColumns[0].columnName,
      purpose: "Track movement over time and identify periods of change.",
      reason: "A date field and numeric measure are available.",
      confidence: "Suggested"
    });
  }
  if (categoricalColumns.length && numericColumns.length) {
    visuals.push({
      id: "category-comparison",
      title: numericColumns[0].columnName + " by " + categoricalColumns[0].columnName,
      chartType: "Bar chart",
      xAxis: categoricalColumns[0].columnName,
      yAxis: numericColumns[0].columnName,
      purpose: "Compare the measure across business categories.",
      reason: "A categorical field can segment a numeric measure.",
      confidence: "Suggested"
    });
  }
  const lowCardinality = categoricalColumns.find(column => column.distinctCount >= 2 && column.distinctCount <= 6);
  if (lowCardinality) {
    visuals.push({
      id: "composition",
      title: lowCardinality.columnName + " distribution",
      chartType: "Donut chart",
      xAxis: lowCardinality.columnName,
      yAxis: "Record count",
      purpose: "Show the composition of records across a small set of categories.",
      reason: "The field has " + lowCardinality.distinctCount + " distinct values.",
      confidence: "Suggested"
    });
  }
  if (numericColumns.length >= 2) {
    visuals.push({
      id: "relationship",
      title: numericColumns[0].columnName + " vs " + numericColumns[1].columnName,
      chartType: "Scatter plot",
      xAxis: numericColumns[0].columnName,
      yAxis: numericColumns[1].columnName,
      purpose: "Explore whether two numeric measures move together.",
      reason: "Two numeric fields are available; this does not establish causation.",
      confidence: "Exploratory"
    });
  }

  const insights = [];
  if (profile.completenessPercentage < 95) {
    insights.push({
      severity: profile.completenessPercentage < 80 ? "High" : "Medium",
      title: "Review missing data",
      detail: "Overall completeness is " + profile.completenessPercentage + "%. Prioritise fields with the highest missing percentages before publishing KPIs."
    });
  }
  columns.filter(column => column.dataType === "numeric" && column.iqrOutlierCount > 0).forEach(column => {
    insights.push({
      severity: "Review",
      title: "Potential outliers in " + column.columnName,
      detail: column.iqrOutlierCount + " value(s) fall outside the 1.5×IQR fences. Investigate them; they are not automatically errors."
    });
  });
  columns.filter(column => column.distinctCount === 1 && column.nonNullCount > 0).forEach(column => {
    insights.push({
      severity: "Low",
      title: "Constant field: " + column.columnName,
      detail: "Only one distinct non-blank value was found, so this field may add little segmentation value."
    });
  });
  if (!visuals.length) {
    insights.push({
      severity: "Info",
      title: "Limited chart combinations detected",
      detail: "The file does not contain an obvious date/numeric or category/numeric combination. Confirm the business meaning of fields or add a suitable date and measure."
    });
  }

  return {
    fileName: profile.fileName,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    completenessPercentage: profile.completenessPercentage,
    detectedFields: {
      numeric: numericColumns.map(column => column.columnName),
      dates: dateColumns.map(column => column.columnName),
      categories: categoricalColumns.map(column => column.columnName)
    },
    kpis,
    visuals,
    insights,
    methodology: [
      "Recommendations are deterministic heuristics based on detected column types and distributions.",
      "Suggested aggregations require business validation; a numeric field is not automatically additive.",
      "Potential outliers are exploratory flags, not confirmed data errors.",
      "No causal, statistical-significance or business-context inference is performed."
    ]
  };
}

function readReportCsvFile(file) {
  if (!file) return Promise.reject(new Error("Choose a CSV file."));
  if (file.size > MAX_REPORT_FILE_BYTES) return Promise.reject(new Error("The CSV file must be 10 MB or smaller."));
  if (!/\.csv$/i.test(file.name)) return Promise.reject(new Error("Please select a .csv file."));
  return file.text().then(text => ({ ...parseCsvText(text), fileName: file.name }));
}

export { MAX_REPORT_FILE_BYTES, summarizeDataset, readReportCsvFile };
