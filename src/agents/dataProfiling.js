import { parseCsvText } from "./dataReconciliation.js";

const MAX_PROFILE_FILE_BYTES = 10 * 1024 * 1024;

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

function parseNumeric(value) {
  if (isBlank(value)) return null;
  const cleaned = String(value).trim().replace(/,/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseDateValue(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{1,2}-\d{1,2}(?:[T ].*)?$/.test(text) &&
      !/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inferColumnType(values) {
  const nonBlank = values.filter(value => !isBlank(value));
  if (!nonBlank.length) return "empty";
  const booleanCount = nonBlank.filter(value => /^(true|false|yes|no|y|n)$/i.test(String(value).trim())).length;
  if (booleanCount === nonBlank.length) return "boolean";
  const numericCount = nonBlank.filter(value => parseNumeric(value) !== null).length;
  if (numericCount === nonBlank.length) return "numeric";
  const dateCount = nonBlank.filter(value => parseDateValue(value) !== null).length;
  if (dateCount === nonBlank.length) return "date";
  return "text";
}

function profileColumn(records, columnName, rowCount) {
  const values = records.map(record => record[columnName] ?? "");
  const nonBlank = values.filter(value => !isBlank(value));
  const frequencies = new Map();
  nonBlank.forEach(value => {
    const key = String(value).trim();
    frequencies.set(key, (frequencies.get(key) || 0) + 1);
  });
  const distinctCount = frequencies.size;
  const duplicateValueRows = nonBlank.length - distinctCount;
  const topValues = Array.from(frequencies.entries())
    .map(([value, count]) => ({ value, count, percentage: round((count / Math.max(nonBlank.length, 1)) * 100, 1) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 5);

  const dataType = inferColumnType(values);
  const profile = {
    columnName,
    dataType,
    totalRows: rowCount,
    nonNullCount: nonBlank.length,
    nullCount: rowCount - nonBlank.length,
    nullPercentage: round(((rowCount - nonBlank.length) / Math.max(rowCount, 1)) * 100, 1),
    distinctCount,
    uniquenessPercentage: round((distinctCount / Math.max(nonBlank.length, 1)) * 100, 1),
    duplicateValueRows,
    topValues,
    minLength: null,
    maxLength: null,
    min: null,
    max: null,
    mean: null,
    median: null,
    standardDeviation: null,
    q1: null,
    q3: null,
    iqrOutlierCount: 0,
    invalidCount: 0,
    sampleValues: nonBlank.slice(0, 5).map(value => String(value))
  };

  if (dataType === "numeric") {
    const numbers = nonBlank.map(parseNumeric).sort((a, b) => a - b);
    const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const variance = numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numbers.length;
    const q1 = percentile(numbers, 0.25);
    const q3 = percentile(numbers, 0.75);
    const lowerFence = q1 - 1.5 * (q3 - q1);
    const upperFence = q3 + 1.5 * (q3 - q1);
    profile.min = round(numbers[0], 4);
    profile.max = round(numbers[numbers.length - 1], 4);
    profile.mean = round(mean, 4);
    profile.median = round(percentile(numbers, 0.5), 4);
    profile.standardDeviation = round(Math.sqrt(variance), 4);
    profile.q1 = round(q1, 4);
    profile.q3 = round(q3, 4);
    profile.iqrOutlierCount = numbers.filter(value => value < lowerFence || value > upperFence).length;
  } else if (dataType === "date") {
    const dates = nonBlank.map(parseDateValue);
    profile.min = new Date(Math.min(...dates)).toISOString().slice(0, 10);
    profile.max = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  } else {
    const lengths = nonBlank.map(value => String(value).length);
    profile.minLength = lengths.length ? Math.min(...lengths) : 0;
    profile.maxLength = lengths.length ? Math.max(...lengths) : 0;
  }

  return profile;
}

function profileDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.records) || !Array.isArray(dataset.headers)) {
    throw new Error("A valid parsed CSV dataset is required.");
  }
  if (!dataset.records.length) throw new Error("The dataset has no data rows.");
  const columns = dataset.headers.map(header => profileColumn(dataset.records, header, dataset.records.length));
  const candidateKeys = columns
    .filter(column => column.nonNullCount === dataset.records.length && column.distinctCount === dataset.records.length)
    .map(column => column.columnName);
  const nullCells = columns.reduce((sum, column) => sum + column.nullCount, 0);
  const totalCells = dataset.records.length * dataset.headers.length;
  const completenessPercentage = round(((totalCells - nullCells) / Math.max(totalCells, 1)) * 100, 1);
  const qualityScore = round(Math.max(0, Math.min(100, completenessPercentage * 0.7 +
    (columns.length ? columns.filter(column => column.dataType !== "empty").length / columns.length * 30 : 0))), 1);

  return {
    fileName: dataset.fileName || "dataset.csv",
    rowCount: dataset.records.length,
    columnCount: dataset.headers.length,
    totalCells,
    nullCells,
    completenessPercentage,
    qualityScore,
    candidateKeys,
    columns
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildProfileCsv(profile) {
  const headers = ["columnName", "dataType", "totalRows", "nonNullCount", "nullCount", "nullPercentage", "distinctCount", "uniquenessPercentage", "duplicateValueRows", "min", "max", "mean", "median", "standardDeviation", "q1", "q3", "iqrOutlierCount", "minLength", "maxLength", "topValues"];
  const rows = profile.columns.map(column => headers.map(header => {
    if (header === "topValues") return column.topValues.map(item => item.value + " (" + item.count + ")").join(" | ");
    return column[header];
  }));
  return [headers, ...rows].map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function readProfileCsvFile(file) {
  if (!file) return Promise.reject(new Error("Choose a CSV file."));
  if (file.size > MAX_PROFILE_FILE_BYTES) return Promise.reject(new Error("The CSV file must be 10 MB or smaller."));
  if (!/\.csv$/i.test(file.name)) return Promise.reject(new Error("Please select a .csv file."));
  return file.text().then(text => ({ ...parseCsvText(text), fileName: file.name }));
}

export {
  MAX_PROFILE_FILE_BYTES,
  inferColumnType,
  profileColumn,
  profileDataset,
  buildProfileCsv,
  readProfileCsvFile
};
