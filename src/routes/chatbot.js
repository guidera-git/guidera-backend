// src/routes/chatbot.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// Node 18+ has global fetch and AbortController

// Use environment variable for Ollama endpoint (default to 11434)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';

/**
 * Attempts to find a matching FAQ entry by fuzzy similarity.
 * Requires pg_trgm extension enabled in PostgreSQL.
 * Returns the answer if similarity >= threshold, otherwise null.
 */
async function checkFaq(message) {
  // Normalize case
  const query = `
    SELECT answer, similarity(lower(question), lower($1)) AS sim
    FROM faqs
    WHERE lower(question) % lower($1)
    ORDER BY sim DESC
    LIMIT 1;
  `;
  const { rows } = await pool.query(query, [message]);
  if (rows.length === 0) return null;
  const { answer, sim } = rows[0];
  // Only return if similarity above threshold (e.g., 0.4)
  return sim >= 0.4 ? answer : null;
}

// Chatbot endpoint with fuzzy FAQ matching
router.post('/chatbot', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Missing message in request body' });
  }

  try {
    // 1) Try fuzzy FAQ match
    const faqAnswer = await checkFaq(message);
    if (faqAnswer) {
      return res.json({ reply: faqAnswer });
    }

    // 2) Fallback to Phi model
    const prompt = `User: ${message}\nAssistant:`;

    // Optional: you can remove timeout logic if your model is slow
    // const controller = new AbortController();
    // const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'phi', prompt, stream: false }),
      // signal: controller.signal
    });

    // clearTimeout(timeout);


    if (!response.ok) {
      console.error('Ollama error response:', await response.text());
      return res.status(500).json({ error: 'AI model error' });
    }

    const data = await response.json();
    const aiReply = data.response?.trim();
    if (!aiReply) {
      return res.status(500).json({ error: 'Empty reply from AI model' });
    }

    return res.json({ reply: aiReply });
  } catch (err) {
    console.error('Chatbot error:', err);
    if (err.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: `Cannot connect to LLM at ${OLLAMA_URL}` });
    }
    if (err.name === 'AbortError') {
      return res.status(500).json({ error: 'AI model took too long to respond' });
    }
    return res.status(500).json({ error: 'Failed to get response from chatbot' });
  }
});

module.exports = router;
