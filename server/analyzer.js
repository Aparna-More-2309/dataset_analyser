export function analyze(headers, rows) {
  const total = rows.length || 1;
  const columns = headers.map((name) => {
    const values = rows.map((row) => String(row[name] ?? '').trim());
    const present = values.filter(Boolean);
    const missing = total - present.length;
    const unique = new Set(present).size;
    const numeric = present.filter((value) => value !== '' && Number.isFinite(Number(value))).map(Number);
    const invalid = /email/i.test(name) ? present.filter((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)).length : 0;
    let outliers = 0;
    if (numeric.length >= 4) {
      const sorted = [...numeric].sort((a, b) => a - b);
      const q = (p) => sorted[Math.floor((sorted.length - 1) * p)];
      const iqr = q(.75) - q(.25), min = q(.25) - 1.5 * iqr, max = q(.75) + 1.5 * iqr;
      outliers = numeric.filter((n) => n < min || n > max).length;
    }
    const suggestion = missing / total > .45 ? 'Remove: mostly empty' : unique <= 1 ? 'Remove: single value' : /(^|_)id$/i.test(name) ? 'Keep: identifier' : 'Keep: useful signal';
    return { name, missing, unique, invalid, outliers, suggestion };
  });
  const signatures = rows.map((row) => headers.map((h) => row[h] ?? '').join('\u0001'));
  const duplicates = signatures.length - new Set(signatures).size;
  const incompleteRows = rows.map((row, index) => ({ index: index + 1, missing: headers.filter((h) => !String(row[h] ?? '').trim()) })).filter((row) => row.missing.length);
  const issues = [];
  if (duplicates) issues.push({ level: 'high', title: 'Duplicate records', detail: `${duplicates} repeated record${duplicates === 1 ? '' : 's'} found.` });
  columns.forEach((column) => {
    if (column.missing) issues.push({ level: column.missing / total > .2 ? 'high' : 'medium', title: `Missing values in ${column.name}`, detail: `${column.missing} of ${rows.length} records are blank.` });
    if (column.invalid) issues.push({ level: 'high', title: `Invalid ${column.name} values`, detail: `${column.invalid} records do not meet the expected format.` });
    if (column.outliers) issues.push({ level: 'medium', title: `Outliers in ${column.name}`, detail: `${column.outliers} possible statistical outlier${column.outliers === 1 ? '' : 's'} detected.` });
  });
  const missingCells = columns.reduce((sum, column) => sum + column.missing, 0);
  const health = Math.max(0, Math.round(100 - (missingCells / (total * Math.max(headers.length, 1))) * 35 - duplicates / total * 25 - issues.filter((issue) => issue.level === 'high').length * 4));
  return { rows: rows.length, columns, duplicates, incompleteRows, issues, missingCells, health, completeness: Math.round((1 - missingCells / (total * Math.max(headers.length, 1))) * 100) };
}
