require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const datasetsRouter = require("./routes/datasets");
const uploadRouter = require("./routes/upload");
const analysisRouter = require("./routes/analysis");
const aiRouter = require("./routes/ai");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
    ].filter(Boolean)

    if (!origin) return callback(null, true)

    if (allowed.includes(origin.replace(/\/$/, ''))) {
      callback(null, true)
    } else {
      console.log('CORS blocked:', origin)
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
}));
app.use(express.json());
app.use(morgan("dev"));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests, please try again in a minute." },
});
app.use(limiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "AI rate limit reached. Try again in a minute." },
});
app.use("/api/ai", aiLimiter);

app.use("/api/datasets", datasetsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/ai", aiRouter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    datasets: ["titanic", "iris", "housing", "sales"],
  });
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

if (process.env.NODE_ENV !== 'development') {
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
  setInterval(() => {
    fetch(`${BACKEND_URL}/api/health`)
      .then(() => console.log('Keep-alive ping sent'))
      .catch(err => console.log('Keep-alive failed:', err.message))
  }, 14 * 60 * 1000) 
}

app.listen(PORT, () => {
  console.log(`\n🚀 DataSphere API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Datasets: http://localhost:${PORT}/api/datasets\n`);
});