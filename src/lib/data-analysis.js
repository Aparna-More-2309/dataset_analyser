const CSV_DELIMITERS = [",", ";", "\t"];

function escapeCsvCell(value) {
  return String(value ?? "")
    .replace(/\r\n|\n|\r/g, " ")
    .trim();
}

export function detectDelimiter(text) {
  const sample = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 20)
    .join("\n");

  if (!sample) return ",";

  const counts = Object.fromEntries(CSV_DELIMITERS.map((value) => [value, 0]));

  for (const line of sample.split(/\r?\n/)) {
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          index += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && counts[character] !== undefined) {
        counts[character] += 1;
      }
    }
  }

  return (
    Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ||
    ","
  );
}

export function splitCsvLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => escapeCsvCell(value));
}

export function parseCsvText(text, fileName = "dataset.csv") {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  if (!raw.trim()) return [];

  const delimiter = detectDelimiter(raw);
  const rows = raw.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (!rows.length) return [];

  const headerRow = splitCsvLine(rows[0], delimiter);
  const headers = headerRow.map(
    (header, index) => header.trim() || `column_${index + 1}`,
  );

  if (!headers.length) return [];

  return rows.slice(1).flatMap((line) => {
    const values = splitCsvLine(line, delimiter);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
    const hasContent = Object.values(row).some(
      (value) => String(value ?? "").trim() !== "",
    );
    return hasContent ? [row] : [];
  });
}

function buildPivotRelationships(headers, rows, limit = 5) {
  const candidates = [];

  for (let i = 0; i < headers.length; i += 1) {
    for (let j = i + 1; j < headers.length; j += 1) {
      const leftKey = headers[i];
      const rightKey = headers[j];
      const leftValues = rows.map((row) => String(row[leftKey] ?? "").trim());
      const rightValues = rows.map((row) => String(row[rightKey] ?? "").trim());
      const leftCategories = [...new Set(leftValues.filter(Boolean))].sort();
      const rightCategories = [...new Set(rightValues.filter(Boolean))].sort();

      if (leftCategories.length < 2 || rightCategories.length < 2) continue;

      const rowTotals = new Map();
      const colTotals = new Map();
      const matrix = new Map();

      for (const row of rows) {
        const leftValue = String(row[leftKey] ?? "").trim();
        const rightValue = String(row[rightKey] ?? "").trim();

        if (!leftValue || !rightValue) continue;

        if (!matrix.has(leftValue)) matrix.set(leftValue, new Map());
        const cell = matrix.get(leftValue);
        cell.set(rightValue, (cell.get(rightValue) || 0) + 1);

        rowTotals.set(leftValue, (rowTotals.get(leftValue) || 0) + 1);
        colTotals.set(rightValue, (colTotals.get(rightValue) || 0) + 1);
      }

      const totalCount = rows.reduce((sum, row) => {
        const leftValue = String(row[leftKey] ?? "").trim();
        const rightValue = String(row[rightKey] ?? "").trim();
        return leftValue && rightValue ? sum + 1 : sum;
      }, 0);

      if (totalCount <= 1) continue;

      let chiSquare = 0;
      for (const leftValue of leftCategories) {
        const rowTotal = rowTotals.get(leftValue) || 0;
        if (!rowTotal) continue;
        for (const rightValue of rightCategories) {
          const observed = matrix.get(leftValue)?.get(rightValue) || 0;
          const expected =
            (rowTotal * (colTotals.get(rightValue) || 0)) / totalCount;
          if (!expected) continue;
          chiSquare += (observed - expected) ** 2 / expected;
        }
      }

      const minDimension = Math.min(
        leftCategories.length,
        rightCategories.length,
      );
      const score =
        minDimension > 1
          ? Math.min(
              1,
              Math.sqrt(chiSquare / (totalCount * (minDimension - 1))),
            )
          : 0;
      if (score < 0.06) continue;

      const matrixRows = leftCategories.map((leftValue) => ({
        label: leftValue,
        total: rowTotals.get(leftValue) || 0,
        values: rightCategories.map((rightValue) => ({
          label: rightValue,
          value: matrix.get(leftValue)?.get(rightValue) || 0,
        })),
      }));

      candidates.push({
        left: leftKey,
        right: rightKey,
        score,
        rows: totalCount,
        matrix: matrixRows,
        rowLabels: leftCategories,
        columnLabels: rightCategories,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function analyze(headers, rows) {
  const total = rows.length || 1;
  const columns = headers.map((name) => {
    const values = rows.map((row) => String(row[name] ?? "").trim());
    const present = values.filter(Boolean);
    const missing = total - present.length;
    const unique = new Set(present).size;
    const numeric = present
      .filter((value) => value !== "" && Number.isFinite(Number(value)))
      .map(Number);
    const invalid = /email/i.test(name)
      ? present.filter((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          .length
      : 0;
    let outliers = 0;
    if (numeric.length >= 4) {
      const sorted = [...numeric].sort((a, b) => a - b);
      const q = (p) => sorted[Math.floor((sorted.length - 1) * p)];
      const iqr = q(0.75) - q(0.25),
        min = q(0.25) - 1.5 * iqr,
        max = q(0.75) + 1.5 * iqr;
      outliers = numeric.filter((n) => n < min || n > max).length;
    }
    const suggestion =
      missing / total > 0.45
        ? "Remove: mostly empty"
        : unique <= 1
          ? "Remove: single value"
          : /(^|_)id$/i.test(name)
            ? "Keep: identifier"
            : "Keep: useful signal";
    return { name, missing, unique, invalid, outliers, suggestion };
  });

  const signatures = rows.map((row) =>
    headers.map((header) => row[header] ?? "").join("\u0001"),
  );
  const duplicates = signatures.length - new Set(signatures).size;
  const incompleteRows = rows
    .map((row, index) => ({
      index: index + 1,
      missing: headers.filter((header) => !String(row[header] ?? "").trim()),
    }))
    .filter((row) => row.missing.length);

  const issues = [];
  if (duplicates)
    issues.push({
      level: "high",
      title: "Duplicate records",
      detail: `${duplicates} repeated record${duplicates === 1 ? "" : "s"} found.`,
    });

  columns.forEach((column) => {
    if (column.missing)
      issues.push({
        level: column.missing / total > 0.2 ? "high" : "medium",
        title: `Missing values in ${column.name}`,
        detail: `${column.missing} of ${rows.length} records are blank.`,
      });
    if (column.invalid)
      issues.push({
        level: "high",
        title: `Invalid ${column.name} values`,
        detail: `${column.invalid} records do not meet the expected format.`,
      });
    if (column.outliers)
      issues.push({
        level: "medium",
        title: `Outliers in ${column.name}`,
        detail: `${column.outliers} possible statistical outlier${column.outliers === 1 ? "" : "s"} detected.`,
      });
  });

  const missingCells = columns.reduce((sum, column) => sum + column.missing, 0);
  const health = Math.max(
    0,
    Math.round(
      100 -
        (missingCells / (total * Math.max(headers.length, 1))) * 35 -
        (duplicates / total) * 25 -
        issues.filter((issue) => issue.level === "high").length * 4,
    ),
  );

  return {
    rows: rows.length,
    columns,
    duplicates,
    incompleteRows,
    issues,
    missingCells,
    health,
    completeness: Math.round(
      (1 - missingCells / (total * Math.max(headers.length, 1))) * 100,
    ),
    pivotRelationships: buildPivotRelationships(headers, rows, 5),
  };
}
