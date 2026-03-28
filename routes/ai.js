const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");
const DATASETS = require("../data/datasets");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DATASET_CONTEXTS = {
  titanic: `Dataset: Titanic (891 rows). Survival rate 38.4%. Females 74.2% survived, males 18.9%. 1st class 62.9%, 2nd 47.3%, 3rd 24.2%. Mean age 29.7, mean fare $32.20.`,
  iris: `Dataset: Iris Species (150 rows, 3 species). Best classifier Random Forest 97.3% accuracy. Petal dimensions are strongest features.`,
  housing: `Dataset: Ames Housing (1460 rows). Price range $34,900–$755,000. Mean $180,921. Top features: OverallQual, GrLivArea, GarageCars.`,
  sales: `Dataset: Global Superstore Sales (9994 rows). Total sales ~$2.3M, profit ~$286K, margin 12.5%. Categories: Furniture, Office Supplies, Technology.`,
};

router.post("/analyse", async (req, res) => {
  const { question, datasetId } = req.body;

  if (!question || !DATASETS[datasetId]) {
    return res.status(400).json({ error: "question and valid datasetId are required." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are a senior data scientist. Answer concisely with specific numbers and actionable insights. Dataset context: ${DATASET_CONTEXTS[datasetId]}`,
        },
        {
          role: "user",
          content: question.trim(),
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Groq error:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

router.post("/analyse-sync", async (req, res) => {
  const { question, datasetId } = req.body;
  if (!question || !DATASETS[datasetId]) {
    return res.status(400).json({ error: "question and valid datasetId are required." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured." });
  }
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: `You are a senior data scientist. ${DATASET_CONTEXTS[datasetId]}` },
        { role: "user",   content: question.trim() },
      ],
    });
    res.json({ answer: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;