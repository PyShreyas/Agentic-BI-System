function maskSql(sql) {
  const chars = [...sql];
  let index = 0;
  while (index < chars.length) {
    if (chars[index] === "-" && chars[index + 1] === "-") {
      while (index < chars.length && chars[index] !== "\n") chars[index++] = " ";
      continue;
    }
    if (chars[index] === "/" && chars[index + 1] === "*") {
      chars[index++] = " ";
      chars[index++] = " ";
      let depth = 1;
      while (index < chars.length && depth) {
        if (chars[index] === "/" && chars[index + 1] === "*") {
          chars[index++] = " ";
          chars[index++] = " ";
          depth += 1;
        } else if (chars[index] === "*" && chars[index + 1] === "/") {
          chars[index++] = " ";
          chars[index++] = " ";
          depth -= 1;
        } else {
          if (chars[index] !== "\n") chars[index] = " ";
          index += 1;
        }
      }
      continue;
    }
    if (chars[index] === "'") {
      chars[index++] = " ";
      while (index < chars.length) {
        if (chars[index] === "'" && chars[index + 1] === "'") {
          chars[index++] = " ";
          chars[index++] = " ";
        } else if (chars[index] === "'") {
          chars[index++] = " ";
          break;
        } else {
          if (chars[index] !== "\n") chars[index] = " ";
          index += 1;
        }
      }
      continue;
    }
    index += 1;
  }
  return chars.join("");
}

function lineAt(sql, index) {
  return sql.slice(0, index).split("\n").length;
}

function findSelectScopes(maskedSql) {
  const selects = [...maskedSql.matchAll(/\bSELECT\b/gi)];
  return selects.map(match => {
    let depth = 0;
    for (let index = 0; index < match.index; index += 1) {
      if (maskedSql[index] === "(") depth += 1;
      else if (maskedSql[index] === ")") depth = Math.max(0, depth - 1);
    }
    return { index: match.index, depth, line: lineAt(maskedSql, match.index) };
  });
}

function describeAdvancedQuery(sql) {
  const masked = maskSql(sql);
  const ctes = [];
  const ctePattern = /(?:\bWITH\s+|,\s*)([A-Za-z_][\w$#]*)\s*(?:\([^)]*\)\s*)?AS\s*\(/gi;
  for (const match of masked.matchAll(ctePattern)) {
    ctes.push({ name: match[1], line: lineAt(masked, match.index) });
  }

  const selectScopes = findSelectScopes(masked);
  const nestedQueries = selectScopes
    .filter(scope => scope.depth > 0)
    .map((scope, index) => {
      const before = masked.slice(Math.max(0, scope.index - 180), scope.index).toUpperCase();
      let location = "nested query";
      if (/\bFROM\s*\(?\s*$/i.test(before)) location = "derived table in FROM";
      else if (/\b(EXISTS|IN|ANY|ALL)\s*\(?\s*$/i.test(before)) location = "predicate subquery";
      else if (/\bAS\s*\(?\s*$/i.test(before)) location = "expression or named subquery";
      return { line: scope.line, depth: scope.depth, location, label: "Nested SELECT " + (index + 1) };
    });

  const windowFunctions = [];
  const windowPattern = /\b([A-Za-z_][\w$]*)\s*\(([^()]*(?:\([^()]*\)[^()]*)?)\)\s*OVER\s*\(/gi;
  for (const match of masked.matchAll(windowPattern)) {
    const functionName = match[1].toUpperCase();
    const start = match.index;
    const overStart = masked.toUpperCase().indexOf("OVER", start + match[0].length - 5);
    let end = overStart >= 0 ? masked.indexOf(")", overStart) : -1;
    const overClause = overStart >= 0 ? masked.slice(overStart, end >= 0 ? end + 1 : overStart + 100) : "OVER";
    const kind = ["ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE"].includes(functionName)
      ? "Ranking"
      : ["LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE"].includes(functionName)
        ? "Offset / value"
        : ["SUM", "AVG", "COUNT", "MIN", "MAX"].includes(functionName)
          ? "Window aggregate"
          : "Window function";
    windowFunctions.push({ name: functionName, kind, line: lineAt(masked, start), overClause: overClause.replace(/\s+/g, " ").trim() });
  }

  const steps = [];
  if (ctes.length) {
    ctes.forEach((cte, index) => steps.push({
      title: "Define CTE: " + cte.name,
      detail: "Build a named intermediate result that later parts of the statement can reference.",
      line: cte.line
    }));
  }
  if (nestedQueries.length) {
    nestedQueries.forEach((nested, index) => steps.push({
      title: nested.label + " — " + nested.location,
      detail: "This SELECT is evaluated as part of its surrounding query. Check whether it is correlated to an outer row and whether it returns one value or multiple rows.",
      line: nested.line
    }));
  }
  if (windowFunctions.length) {
    windowFunctions.forEach(item => steps.push({
      title: item.name + " window calculation",
      detail: item.kind + " function evaluated over the row set defined by its OVER clause. Unlike GROUP BY, a window function normally retains individual result rows.",
      line: item.line
    }));
  }
  if (!steps.length) steps.push({
    title: "No advanced query structure detected",
    detail: "No CTE, nested SELECT or recognised window function was identified. The basic clause explanation is still available.",
    line: null
  });

  const notes = [];
  if (nestedQueries.length) notes.push("Nested SELECT statements were detected. Check correlation, returned row counts and whether the subquery is evaluated once or per outer row.");
  if (ctes.length > 1) notes.push("Multiple CTEs were detected. Confirm that each CTE name is unique and that later CTEs reference only earlier definitions.");
  if (windowFunctions.length) notes.push("Window functions were detected. Review PARTITION BY and ORDER BY inside each OVER clause; these define the calculation scope and ordering.");
  if (windowFunctions.some(item => ["ROW_NUMBER", "RANK", "DENSE_RANK", "NTILE"].includes(item.name))) {
    notes.push("Ranking functions can produce different tie behaviour: ROW_NUMBER assigns unique sequence numbers, RANK leaves gaps after ties, and DENSE_RANK does not leave gaps.");
  }

  return { ctes, nestedQueries, windowFunctions, steps, notes };
}

export { describeAdvancedQuery };
