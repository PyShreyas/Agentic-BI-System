function maskSql(sql) {
  return sql
    .replace(/--[^\n]*/g, match => " ".repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "))
    .replace(/'(?:''|[^'])*'/g, match => match.replace(/[^\n]/g, " "));
}

function addFinding(findings, id, severity, title, detail, recommendation, evidence) {
  findings.push({ id, severity, title, detail, recommendation, evidence });
}

function analyzeSqlPerformance(sql) {
  const masked = maskSql(sql);
  const findings = [];

  if (/\bSELECT\s+(?:DISTINCT\s+)?\*/i.test(masked)) {
    addFinding(findings, "select-star", "medium", "Avoid SELECT *",
      "The query requests every column from the selected source. This can increase I/O, memory use and network transfer, and makes downstream dependencies less stable.",
      "List only the columns required by the report or analysis.", "SELECT *");
  }

  if (/\bLIKE\s+N?'\s*%/i.test(sql) || /\bLIKE\s+'\s*%/i.test(sql)) {
    addFinding(findings, "leading-wildcard", "high", "Leading-wildcard LIKE",
      "A pattern beginning with % often prevents an ordinary index seek on the searched column.",
      "If the business requirement allows it, use a prefix search, a full-text index, or a separately designed search strategy.", "LIKE '%value'");
  }

  const functionPredicate = /\bWHERE\b[\s\S]{0,500}?\b(?:YEAR|MONTH|DAY|CAST|CONVERT|ISNULL|COALESCE|LOWER|UPPER|LTRIM|RTRIM|DATEPART|DATEDIFF)\s*\(\s*(?:\w+\.)?\[?([A-Za-z_][\w$]*)\]?/i.exec(masked);
  if (functionPredicate) {
    addFinding(findings, "function-filter-column", "high", "Function applied to a filtered column",
      "A function appears around a column in the WHERE clause. This may make a predicate non-sargable and reduce the chance of an index seek.",
      "Where possible, rewrite the condition as a range against the original column, while preserving the same date/time or null semantics.", functionPredicate[0].trim());
  }

  if (/\bWHERE\b[\s\S]{0,600}?\b(?:OR)\b/i.test(masked)) {
    addFinding(findings, "or-predicate", "low", "OR predicate in filtering",
      "OR conditions can complicate cardinality estimates and index selection. This is not inherently inefficient; impact depends on selectivity and indexes.",
      "Check the actual execution plan and compare alternatives such as UNION ALL only when the branches are mutually exclusive or duplicates are handled.", "OR");
  }

  if (/\bSELECT\s+DISTINCT\b/i.test(masked)) {
    addFinding(findings, "distinct", "medium", "Review DISTINCT usage",
      "DISTINCT may require a sort or hash operation to remove duplicates. It can also hide duplicate rows introduced by joins.",
      "Confirm why duplicates occur. If they indicate an incorrect join, fix the join keys rather than using DISTINCT to mask the issue.", "SELECT DISTINCT");
  }

  if (/\bNOT\s+IN\s*\(/i.test(masked)) {
    addFinding(findings, "not-in-null", "medium", "Check NOT IN and NULL behaviour",
      "If the subquery can return NULL, NOT IN may produce unexpected results. Performance also depends on the plan and data distribution.",
      "Confirm NULL handling. Consider NOT EXISTS with an explicit correlation predicate when it matches the intended logic.", "NOT IN (...)");
  }

  if (/\bORDER\s+BY\b/i.test(masked) && !/\bTOP\s*(?:\(|\d)|\bOFFSET\b/i.test(masked)) {
    addFinding(findings, "sort-all-rows", "low", "Sorting the full result",
      "ORDER BY may require a sort operation, especially when no suitable index supports the requested order.",
      "Keep the sort only when required by the consumer. Review sort cost and memory grants in the actual execution plan.", "ORDER BY");
  }

  if (!/\bWHERE\b/i.test(masked) && !/\bTOP\s*(?:\(|\d)/i.test(masked)) {
    addFinding(findings, "unbounded-read", "medium", "No row filter or row limit detected",
      "The statement may read a large portion of its source. This can be intentional for full extracts, but validate expected volume.",
      "Apply business-relevant date, status or partition filters when the use case does not require a full extract.", "No WHERE / TOP detected");
  }

  if (/\bNOLOCK\b/i.test(masked)) {
    addFinding(findings, "nolock", "high", "NOLOCK consistency risk",
      "NOLOCK can return uncommitted, missing or duplicated rows and does not guarantee a consistent read.",
      "Prefer the database's approved isolation strategy. Discuss READ_COMMITTED_SNAPSHOT or snapshot isolation with the DBA rather than adding hints casually.", "NOLOCK");
  }

  const counts = findings.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, { high: 0, medium: 0, low: 0 });

  return {
    findings,
    counts,
    summary: findings.length
      ? findings.length + " review point" + (findings.length === 1 ? "" : "s") + " detected by static SQL patterns."
      : "No configured review patterns were detected. This does not establish that the query is performant."
  };
}

export { analyzeSqlPerformance };
