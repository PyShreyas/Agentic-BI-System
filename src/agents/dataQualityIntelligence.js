const recommendationsByType = {
  required: "Review source completeness and confirm whether the field must be mandatory.",
  unique: "Investigate duplicate keys and confirm the intended business grain.",
  allowedValues: "Compare observed values with the approved reference list.",
  numericRange: "Check units, sign conventions and source calculations.",
  dateRange: "Verify date formats and the permitted reporting period.",
  compareColumns: "Review the relationship expected between the compared columns."
};

export function analyzeQualityHistory(history) {
  const snapshots = Array.isArray(history) ? history.filter(item => item && typeof item.fileName === "string") : [];
  const recurringMap = new Map();

  snapshots.forEach(snapshot => {
    (Array.isArray(snapshot.ruleFailures) ? snapshot.ruleFailures : []).forEach(failure => {
      if (!failure || !failure.ruleName || !failure.column) return;
      const key = [snapshot.fileName, failure.ruleName, failure.column].join("::");
      const current = recurringMap.get(key) || {
        key, fileName: snapshot.fileName, ruleName: failure.ruleName,
        column: failure.column, type: failure.type || "required",
        severity: failure.severity === "error" ? "error" : "warning",
        runCount: 0, totalFailed: 0, latestFailed: 0
      };
      current.runCount += 1;
      current.totalFailed += Math.max(0, Number(failure.failed) || 0);
      current.latestFailed = Math.max(current.latestFailed, Number(failure.failed) || 0);
      if (failure.severity === "error") current.severity = "error";
      recurringMap.set(key, current);
    });
  });

  const recurringFailures = [...recurringMap.values()]
    .filter(item => item.runCount >= 2)
    .map(item => ({
      ...item,
      priority: (item.severity === "error" ? 1000 : 0) + item.runCount * 100 + item.totalFailed,
      recommendation: recommendationsByType[item.type] || "Review the failed rule with the data owner."
    }))
    .sort((a, b) => b.priority - a.priority || b.totalFailed - a.totalFailed)
    .slice(0, 10);

  const trendByFile = new Map();
  snapshots.forEach(snapshot => {
    const group = trendByFile.get(snapshot.fileName) || [];
    group.push(snapshot);
    trendByFile.set(snapshot.fileName, group);
  });
  const trends = [...trendByFile.entries()].map(([fileName, runs]) => {
    const comparable = runs.filter(run => Number.isFinite(Number(run.qualityPercentage)) && Number.isFinite(Number(run.rowCount)));
    const latest = comparable[0];
    const previous = comparable.slice(1).find(run => Number(run.rowCount) === Number(latest?.rowCount));
    return {
      fileName,
      runCount: runs.length,
      latestScore: latest ? Number(latest.qualityPercentage) : null,
      previousComparableScore: previous ? Number(previous.qualityPercentage) : null,
      delta: latest && previous ? Math.round((Number(latest.qualityPercentage) - Number(previous.qualityPercentage)) * 10) / 10 : null,
      comparable: Boolean(latest && previous)
    };
  }).sort((a, b) => b.runCount - a.runCount);

  return { snapshotCount: snapshots.length, recurringFailures, trends };
}
