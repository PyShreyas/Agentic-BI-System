const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseCsvText(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("The CSV file is empty.");

  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(value.replace(/\r$/, ""));
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV must contain a header and at least one data row.");

  const rawHeaders = rows[0].map((header, index) => header.trim() || "column_" + (index + 1));
  const seen = new Map();
  const headers = rawHeaders.map(header => {
    const count = (seen.get(header) || 0) + 1;
    seen.set(header, count);
    return count === 1 ? header : header + "_" + count;
  });

  const records = rows.slice(1).map((cells, index) => {
    const record = { __rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      record[header] = (cells[columnIndex] ?? "").trim();
    });
    return record;
  });

  return { headers, records, rowCount: records.length };
}

function validateFile(file) {
  if (!file) throw new Error("Choose a CSV file.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Each CSV must be 10 MB or smaller.");
  if (!/\.csv$/i.test(file.name)) throw new Error("Please select a .csv file.");
}

function readCsvFile(file) {
  validateFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve({ ...parseCsvText(reader.result), fileName: file.name });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsText(file);
  });
}

function normaliseKey(value, caseInsensitive) {
  const text = String(value ?? "").trim();
  return caseInsensitive ? text.toLocaleLowerCase() : text;
}

function buildKey(record, keyColumns, caseInsensitive) {
  return keyColumns.map(column => normaliseKey(record[column], caseInsensitive)).join("\u001f");
}

function findDuplicates(dataset, keyColumns, options = {}) {
  if (!dataset || !keyColumns.length) return { duplicateGroups: [], duplicateRows: 0, uniqueKeys: 0 };
  const groups = new Map();
  dataset.records.forEach(record => {
    const key = buildKey(record, keyColumns, options.caseInsensitive);
    if (keyColumns.some(column => !normaliseKey(record[column], options.caseInsensitive))) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const duplicateGroups = Array.from(groups.entries())
    .filter(([, records]) => records.length > 1)
    .map(([key, records]) => ({ key, records, extraRows: records.length - 1 }));
  return {
    duplicateGroups,
    duplicateRows: duplicateGroups.reduce((sum, group) => sum + group.extraRows, 0),
    uniqueKeys: groups.size
  };
}

function reconcileDatasets(left, right, leftKey, rightKey, compareColumns, options = {}) {
  if (!left || !right || !leftKey || !rightKey) {
    throw new Error("Upload both CSV files and select a key column in each file.");
  }

  const leftDuplicates = findDuplicates(left, [leftKey], options);
  const rightDuplicates = findDuplicates(right, [rightKey], options);
  const leftMap = new Map();
  const rightMap = new Map();

  left.records.forEach(record => {
    const key = buildKey(record, [leftKey], options.caseInsensitive);
    if (key) {
      if (!leftMap.has(key)) leftMap.set(key, record);
    }
  });
  right.records.forEach(record => {
    const key = buildKey(record, [rightKey], options.caseInsensitive);
    if (key) {
      if (!rightMap.has(key)) rightMap.set(key, record);
    }
  });

  const matched = [];
  const onlyLeft = [];
  const onlyRight = [];
  const differences = [];

  leftMap.forEach((leftRecord, key) => {
    if (!rightMap.has(key)) {
      onlyLeft.push(leftRecord);
      return;
    }
    const rightRecord = rightMap.get(key);
    matched.push({ key, leftRecord, rightRecord });
    const changedColumns = compareColumns.filter(column =>
      String(leftRecord[column] ?? "").trim() !== String(rightRecord[column] ?? "").trim()
    );
    if (changedColumns.length) {
      differences.push({ key, leftRecord, rightRecord, changedColumns });
    }
  });

  rightMap.forEach((record, key) => {
    if (!leftMap.has(key)) onlyRight.push(record);
  });

  return {
    counts: {
      leftRows: left.rowCount,
      rightRows: right.rowCount,
      leftUniqueKeys: leftMap.size,
      rightUniqueKeys: rightMap.size,
      matched: matched.length,
      onlyLeft: onlyLeft.length,
      onlyRight: onlyRight.length,
      changed: differences.length,
      leftDuplicateGroups: leftDuplicates.duplicateGroups.length,
      rightDuplicateGroups: rightDuplicates.duplicateGroups.length
    },
    leftDuplicates,
    rightDuplicates,
    matched,
    onlyLeft,
    onlyRight,
    differences
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildReconciliationCsv(result, leftKey, compareColumns) {
  const headers = ["businessKey", "status", "changedColumns", "leftRowNumber", "rightRowNumber", ...compareColumns.flatMap(column => ["left_" + column, "right_" + column])];
  const rows = [];
  result.onlyLeft.forEach(record => rows.push([
    record[leftKey], "Only in source A", "", record.__rowNumber, "",
    ...compareColumns.flatMap(column => [record[column] ?? "", ""])
  ]));
  result.onlyRight.forEach(record => rows.push([
    "", "Only in source B", "", "", record.__rowNumber,
    ...compareColumns.flatMap(column => ["", record[column] ?? ""])
  ]));
  result.differences.forEach(item => rows.push([
    item.key, "Value mismatch", item.changedColumns.join("; "), item.leftRecord.__rowNumber, item.rightRecord.__rowNumber,
    ...compareColumns.flatMap(column => [item.leftRecord[column] ?? "", item.rightRecord[column] ?? ""])
  ]));
  return [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\r\n");
}

export {
  MAX_FILE_BYTES,
  parseCsvText,
  readCsvFile,
  findDuplicates,
  reconcileDatasets,
  buildReconciliationCsv
};
