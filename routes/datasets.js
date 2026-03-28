const express = require("express");
const router = express.Router();
const DATASETS = require("../data/datasets");

router.get("/", (req, res) => {
  const list = Object.values(DATASETS).map(({ meta }) => meta);
  res.json({ datasets: list, total: list.length });
});

router.get("/:id", (req, res) => {
  const ds = DATASETS[req.params.id];
  if (!ds) return res.status(404).json({ error: `Dataset '${req.params.id}' not found.` });

  let rows = [...ds.rows];

  const { filter_col, filter_val, filter_op = "eq" } = req.query;
  if (filter_col && filter_val !== undefined) {
    rows = rows.filter(row => {
      const cell = row[filter_col];
      if (cell === undefined) return true;
      const numVal = parseFloat(filter_val);
      switch (filter_op) {
        case "eq":  return String(cell).toLowerCase() === filter_val.toLowerCase();
        case "neq": return String(cell).toLowerCase() !== filter_val.toLowerCase();
        case "gt":  return parseFloat(cell) > numVal;
        case "gte": return parseFloat(cell) >= numVal;
        case "lt":  return parseFloat(cell) < numVal;
        case "lte": return parseFloat(cell) <= numVal;
        case "contains": return String(cell).toLowerCase().includes(filter_val.toLowerCase());
        default:    return true;
      }
    });
  }

  const { sort_col, sort_dir = "asc" } = req.query;
  if (sort_col) {
    rows.sort((a, b) => {
      const va = a[sort_col], vb = b[sort_col];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const dir = sort_dir === "desc" ? -1 : 1;
      return typeof va === "number" ? dir * (va - vb) : dir * String(va).localeCompare(String(vb));
    });
  }

  const page  = Math.max(1, parseInt(req.query.page  || 1));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || 50)));
  const total = rows.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data  = rows.slice(start, start + limit);

  res.json({
    meta: ds.meta,
    pagination: { page, limit, total, pages },
    rows: data,
  });
});

router.get("/:id/stats", (req, res) => {
  const ds = DATASETS[req.params.id];
  if (!ds) return res.status(404).json({ error: `Dataset '${req.params.id}' not found.` });

  const rows = ds.rows;
  const numericCols = ds.meta.columns.filter(c => c.type === "float" || c.type === "integer");

  const stats = {};
  numericCols.forEach(({ key }) => {
    const vals = rows.map(r => r[key]).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (!vals.length) return;
    vals.sort((a, b) => a - b);
    const n    = vals.length;
    const sum  = vals.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const q1   = vals[Math.floor(n * 0.25)];
    const med  = n % 2 === 0 ? (vals[n/2-1] + vals[n/2]) / 2 : vals[Math.floor(n/2)];
    const q3   = vals[Math.floor(n * 0.75)];
    stats[key] = {
      count: n,
      missing: rows.length - n,
      min:  +vals[0].toFixed(4),
      max:  +vals[n-1].toFixed(4),
      mean: +mean.toFixed(4),
      median: +med.toFixed(4),
      std:  +Math.sqrt(variance).toFixed(4),
      q1:   +q1.toFixed(4),
      q3:   +q3.toFixed(4),
      iqr:  +(q3 - q1).toFixed(4),
    };
  });

  const catCols = ds.meta.columns.filter(c => c.type === "string");
  const freqs = {};
  catCols.forEach(({ key }) => {
    const counts = {};
    rows.forEach(r => {
      const v = r[key];
      if (v !== null && v !== undefined) counts[v] = (counts[v] || 0) + 1;
    });
    freqs[key] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count, pct: +((count / rows.length) * 100).toFixed(2) }));
  });

  res.json({ dataset: req.params.id, rows: rows.length, numeric: stats, categorical: freqs });
});

module.exports = router;