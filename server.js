import dotenv from "dotenv";
dotenv.config();
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { runAgentPipeline } from "./agents.js";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 3000;

// POST /chat — accepts a user message and returns an AI response
app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "A non-empty 'message' string is required." });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "API_KEY environment variable is not set." });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Express Chat Backend",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: "You are a smart AI assistant." },
          { role: "user", content: message.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenRouter error:", errorBody);
      return res.status(response.status).json({
        error: "OpenRouter API request failed.",
        details: errorBody,
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: "Unexpected response from OpenRouter." });
    }

    return res.json({ reply });

  } catch (err) {
    console.error("Internal error:", err);
    return res.status(500).json({ error: "Error fetching AI response.", details: err.message });
  }
});

// POST /search — DuckDuckGo Instant Answer API
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== "string" || query.trim() === "") {
    return res.status(400).json({ error: "A non-empty 'query' string is required." });
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query.trim())}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });

    const data = await response.json();

    // Extract best available result
    const result = {
      heading:  data.Heading        || null,
      abstract: data.AbstractText   || null,
      source:   data.AbstractSource || null,
      url:      data.AbstractURL    || null,
      answer:   data.Answer         || null,
      type:     data.Type           || null,
      relatedTopics: (data.RelatedTopics || [])
        .filter(t => t.Text && t.FirstURL)
        .slice(0, 3)
        .map(t => ({ text: t.Text, url: t.FirstURL })),
    };

    const hasContent = result.abstract || result.answer || result.relatedTopics.length > 0;
    return res.json({ found: hasContent, result });

  } catch (err) {
    console.error("Search error:", err);
    return res.status(500).json({ error: "Search failed.", details: err.message });
  }
});

// POST /agent-chat — Multi-agent pipeline (Planner → Researcher → Executor → Reviewer)
app.post("/agent-chat", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "A non-empty 'message' string is required." });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: "API_KEY environment variable is not set." });
  }

  try {
    const result = await runAgentPipeline(message.trim());
    return res.json(result);
  } catch (err) {
    console.error("Agent pipeline error:", err);
    return res.status(500).json({ error: "Agent pipeline failed.", details: err.message });
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
