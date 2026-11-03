const blockedWords = new Set([
  "INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "ALTER", "CREATE",
  "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "DENY",
  "BACKUP", "RESTORE", "DBCC", "INTO", "BULK"
]);
const blockedFunctions = new Set(["XP_CMDSHELL", "SP_OACREATE", "SP_OAMETHOD", "SP_OAGetProperty", "SP_OASetProperty"]);

function tokenizeSql(sql) {
  const tokens = [];
  const issues = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") { depth += 1; index += 2; }
        else if (sql[index] === "*" && sql[index + 1] === "/") { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth > 0) issues.push("A block comment is not closed.");
      continue;
    }
    if (char === "'" ) {
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") index += 2;
        else if (sql[index] === "'") { index += 1; closed = true; break; }
        else index += 1;
      }
      if (!closed) issues.push("A string literal is not closed.");
      tokens.push({ type: "literal", value: "STRING" });
      continue;
    }
    if (char === "[" || char === "`") {
      const closing = char === "[" ? "]" : "`";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === closing && sql[index + 1] === closing) index += 2;
        else if (sql[index] === closing) { index += 1; break; }
        else index += 1;
      }
      tokens.push({ type: "identifier", value: "IDENTIFIER" });
      continue;
    }
    if (/[A-Za-z_#@]/.test(char)) {
      const start = index;
      index += 1;
      while (index < sql.length && /[A-Za-z0-9_$#@]/.test(sql[index])) index += 1;
      tokens.push({ type: "word", value: sql.slice(start, index).toUpperCase() });
      continue;
    }
    tokens.push({ type: "symbol", value: char });
    index += 1;
  }
  return { tokens, issues };
}

export function validateReadOnlySql(sql) {
  const source = String(sql || "").trim();
  if (!source) return { status: "blocked", blockers: ["Enter a SQL statement to validate."], warnings: [], checks: [] };

  const { tokens, issues } = tokenizeSql(source);
  const words = tokens.filter(token => token.type === "word").map(token => token.value);
  const blockers = [...issues];
  const warnings = [];
  const semicolonIndexes = tokens.map((token, index) => token.value === ";" ? index : -1).filter(index => index >= 0);
  const finalTokenIndex = tokens.length - 1;

  if (!words.length || !["SELECT", "WITH"].includes(words[0])) {
    blockers.push("Only a single SELECT statement or read-only CTE beginning with WITH is accepted.");
  }
  const detectedBlocked = [...new Set(words.filter(word => blockedWords.has(word)))];
  if (detectedBlocked.length) blockers.push("Blocked operation keyword(s): " + detectedBlocked.join(", ") + ".");
  const dangerousFunction = words.find(word => blockedFunctions.has(word));
  if (dangerousFunction) blockers.push("Potentially dangerous system/automation function detected: " + dangerousFunction + ".");

  if (semicolonIndexes.length > 1 || (semicolonIndexes.length === 1 && semicolonIndexes[0] !== finalTokenIndex)) {
    blockers.push("Multiple statements or an embedded statement terminator were detected.");
  }
  if (tokens.some((token, index) => token.value === "@" && tokens[index + 1]?.value === "@")) {
    warnings.push("System variables are present; confirm they are expected and do not expose sensitive server details.");
  }
  if (words.includes("SELECT") && tokens.some((token, index) => token.value === "*" && words.includes("SELECT"))) {
    warnings.push("A wildcard (*) may return unnecessary columns; list only the fields required.");
  }
  if (words.includes("NOLOCK")) warnings.push("NOLOCK can return dirty or inconsistent data; use only when its trade-offs are understood.");
  if (words.includes("SELECT") && !words.includes("TOP") && !words.includes("WHERE")) {
    warnings.push("No TOP or WHERE clause was detected. Review the expected scan size before running this query.");
  } else if (words.includes("SELECT") && !words.includes("TOP")) {
    warnings.push("No TOP limit was detected. Consider a bounded validation sample for large sources.");
  }
  if (words.includes("ORDER") && !words.includes("BY")) warnings.push("ORDER appears without BY; review the sort clause.");
  if (words.includes("UNION") && words.includes("UNION") && !words.includes("ALL")) {
    warnings.push("UNION removes duplicates and may add sorting cost; confirm that this is intended.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const status = uniqueBlockers.length ? "blocked" : uniqueWarnings.length ? "review" : "passed";
  return {
    status,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    checks: [
      { label: "Read-only statement shape", passed: words.length > 0 && ["SELECT", "WITH"].includes(words[0]) },
      { label: "Write / DDL keyword scan", passed: detectedBlocked.length === 0 },
      { label: "Single statement", passed: semicolonIndexes.length <= 1 && (!semicolonIndexes.length || semicolonIndexes[0] === finalTokenIndex) },
      { label: "Comment and string closure", passed: issues.length === 0 },
      { label: "Dangerous function scan", passed: !dangerousFunction }
    ]
  };
}
