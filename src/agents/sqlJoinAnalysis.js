const identifier = "(?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)";
const objectPattern = new RegExp(identifier + "(?:\\s*\\.\\s*" + identifier + "){0,2}", "g");

function cleanSql(sql) {
  return sql
    .replace(/--[^\\n]*/g, " ")
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
}

function normalizeIdentifier(value) {
  return value.replace(/[\\[\\]]/g, "").replace(/\\s+/g, "").toLowerCase();
}

function analyzeSqlJoins(sql) {
  const normalized = cleanSql(sql);
  const sources = [];
  const sourcePattern = new RegExp("\\b(?:FROM|JOIN)\\s+(" + identifier + "(?:\\s*\\.\\s*" + identifier + "){0,2})(?:\\s+(?:AS\\s+)?(" + identifier + "))?", "gi");
  const reserved = new Set(["ON", "WHERE", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "CROSS", "OUTER", "GROUP", "ORDER", "HAVING", "UNION", "AND", "OR"]);
  for (const match of normalized.matchAll(sourcePattern)) {
    const aliasCandidate = (match[2] || "").replace(/[\\[\\]]/g, "");
    const alias = aliasCandidate && !reserved.has(aliasCandidate.toUpperCase()) ? aliasCandidate : match[1].split(".").pop().replace(/[\\[\\]]/g, "");
    sources.push({ object: match[1].replace(/\\s+/g, ""), alias, key: alias.toLowerCase() });
  }

  const joins = [];
  const joinPattern = /\\b((?:INNER|LEFT(?:\\s+OUTER)?|RIGHT(?:\\s+OUTER)?|FULL(?:\\s+OUTER)?|CROSS)?\\s*JOIN)\\s+((?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)(?:\\s*\\.\\s*(?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)){0,2})(?:\\s+(?:AS\\s+)?((?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)))?(?:\\s+ON\\s+([\\s\\S]*?))?(?=\\b(?:(?:INNER|LEFT|RIGHT|FULL|CROSS)\\s+)?JOIN\\b|\\bWHERE\\b|\\bGROUP\\s+BY\\b|\\bHAVING\\b|\\bORDER\\s+BY\\b|\\bUNION\\b|;|$)/gi;
  for (const match of normalized.matchAll(joinPattern)) {
    const joinType = match[1].replace(/\\s+/g, " ").trim().toUpperCase();
    const object = match[2].replace(/\\s+/g, "");
    const aliasRaw = (match[3] || object.split(".").pop()).replace(/[\\[\\]]/g, "");
    const onClause = (match[4] || "").trim();
    const predicates = onClause ? onClause.split(/\\bAND\\b/i).map(value => value.trim()).filter(Boolean) : [];
    const pairs = [];
    for (const predicate of predicates) {
      const equality = predicate.match(/((?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)\\s*\\.\\s*(?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*))\\s*=\\s*((?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*)\\s*\\.\\s*(?:\\[[^\\]]+\\]|[A-Za-z_][\\w$#]*))/);
      if (equality) {
        const left = equality[1].replace(/\\s+/g, "");
        const right = equality[2].replace(/\\s+/g, "");
        pairs.push({ left, right });
      }
    }
    const knownAliases = new Set(sources.map(source => source.key));
    const unknownAliases = [...new Set(pairs.flatMap(pair => [pair.left.split(".")[0], pair.right.split(".")[0]]).map(value => normalizeIdentifier(value)))].filter(alias => !knownAliases.has(alias));
    const notes = [];
    if (joinType.startsWith("CROSS")) notes.push("CROSS JOIN has no matching predicate and can multiply every left row by every right row.");
    else if (!onClause) notes.push("No ON predicate was detected. Confirm the join syntax and intended matching rule.");
    if (/\\bOR\\b/i.test(onClause)) notes.push("OR appears in the ON clause. Review predicate grouping because it can broaden matches.");
    if (onClause && !pairs.length && !joinType.startsWith("CROSS")) notes.push("No simple qualified column equality was recognised. The condition may use expressions, casts, or unqualified columns.");
    if (unknownAliases.length) notes.push("Unrecognised qualifier(s) in detected key pairs: " + unknownAliases.join(", ") + ".");
    if (/\\b(CAST|CONVERT|COALESCE|ISNULL|UPPER|LOWER|TRIM)\\s*\\(/i.test(onClause)) notes.push("A function or conversion appears in the join condition; check data-type compatibility and index usage.");
    joins.push({
      type: joinType,
      object,
      alias: aliasRaw,
      onClause,
      predicates,
      pairs,
      notes,
      cardinality: "Not inferred — validate uniqueness and expected row multiplication against the data."
    });
  }

  return {
    sources,
    joins,
    summary: joins.length
      ? joins.length + " join" + (joins.length === 1 ? "" : "s") + " detected; join keys are shown only when a qualified equality could be recognised."
      : "No JOIN clause detected."
  };
}

export { analyzeSqlJoins };
