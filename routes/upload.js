const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadedDatasets = new Map();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".csv") {
      return cb(new Error("Only CSV files are allowed."));
    }
    cb(null, true);
  },
});

function parseCSV(buffer) {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = parseCSVLine(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => {
      const raw = values[idx]?.trim() ?? "";
      const num = Number(raw);
      row[h.trim()] = raw === "" ? null : (!isNaN(num) && raw !== "" ? num : raw);
    });
    rows.push(row);
  }
  return { headers: headers.map(h => h.trim()), rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function inferType(values) {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return "string";
  if (nonNull.every(v => typeof v === "number" && Number.isInteger(v))) return "integer";
  if (nonNull.every(v => typeof v === "number")) return "float";
  // Check date
  const dateRe = /^\d{4}-\d{2}-\d{2}/;
  if (nonNull.every(v => dateRe.test(String(v)))) return "date";
  return "string";
}
function computeStats(rows, headers) {
  const stats = {};
  headers.forEach(h => {
    const vals = rows.map(r => r[h]).filter(v => v !== null && v !== undefined);
    const numVals = vals.filter(v => typeof v === "number");
    if (numVals.length > 0) {
      numVals.sort((a, b) => a - b);
      const sum = numVals.reduce((a, b) => a + b, 0);
      const mean = sum / numVals.length;
      const variance = numVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numVals.length;
      stats[h] = {
        type: "numeric",
        count: numVals.length,
        missing: rows.length - numVals.length,
        min: +numVals[0].toFixed(4),
        max: +numVals[numVals.length - 1].toFixed(4),
        mean: +mean.toFixed(4),
        std: +Math.sqrt(variance).toFixed(4),
        median: +numVals[Math.floor(numVals.length / 2)].toFixed(4),
      };
    } else {
      const counts = {};
      vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      const topValues = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      stats[h] = {
        type: "categorical",
        count: vals.length,
        missing: rows.length - vals.length,
        unique: Object.keys(counts).length,
        topValues: topValues.map(([value, count]) => ({ value, count })),
      };
    }
  });
  return stats;
}

router.post("/", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const { headers, rows } = parseCSV(req.file.buffer);

    const columns = headers.map(h => ({
      key: h,
      type: inferType(rows.map(r => r[h])),
      description: `Column: ${h}`,
    }));

    const id = `upload_${Date.now()}`;
    const name = req.file.originalname.replace(".csv", "");
    const stats = computeStats(rows, headers);

    const dataset = {
      meta: {
        id,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        source: "User Upload",
        rows: rows.length,
        cols: headers.length,
        description: `Uploaded CSV: ${req.file.originalname}. ${rows.length} rows, ${headers.length} columns.`,
        tags: ["uploaded", "custom", "csv"],
        columns,
        uploadedAt: new Date().toISOString(),
        fileSize: req.file.size,
      },
      rows,
      stats,
    };

    uploadedDatasets.set(id, dataset);

    res.json({
      success: true,
      id,
      name,
      rows: rows.length,
      cols: headers.length,
      columns,
      preview: rows.slice(0, 5),
      stats,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/", (req, res) => {
  const list = Array.from(uploadedDatasets.values()).map(({ meta }) => meta);
  res.json({ datasets: list, total: list.length });
});

router.get("/:id", (req, res) => {
  const ds = uploadedDatasets.get(req.params.id);
  if (!ds) return res.status(404).json({ error: "Uploaded dataset not found." });

  let rows = [...ds.rows];

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

  res.json({
    meta: ds.meta,
    stats: ds.stats,
    pagination: { page, limit, total, pages },
    rows: rows.slice(start, start + limit),
  });
});

router.delete("/:id", (req, res) => {
  if (!uploadedDatasets.has(req.params.id)) {
    return res.status(404).json({ error: "Dataset not found." });
  }
  uploadedDatasets.delete(req.params.id);
  res.json({ success: true, message: "Dataset deleted." });
});

module.exports = router;
module.exports.uploadedDatasets = uploadedDatasets;