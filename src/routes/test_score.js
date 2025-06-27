// src/routes/test_score.js

const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth'); // JWT auth middleware
const router = express.Router();

// GET /api/tests/score
// Returns per-subject score summary for the logged-in user
router.get('/test/score', authenticate, async (req, res) => {
  const userId = req.user.id;
  console.log('UserID:', userId);

  try {
    const result = await pool.query(
      `SELECT subject,
              COUNT(*) AS attempt_count,
              SUM(score) AS total_score,
              AVG(score) AS average_score
       FROM test_attempts
       WHERE user_id = $1 AND completed_at IS NOT NULL AND score IS NOT NULL
       GROUP BY subject
       ORDER BY subject`,
      [userId]
    );

    const summary = result.rows.map(row => ({
      subject: row.subject,
      attempts: parseInt(row.attempt_count, 10),
      totalScore: parseInt(row.total_score, 10),
      averageScore: Math.round(parseFloat(row.average_score))
    }));

    console.log('Score Summary:', summary);

    return res.json({ summary });

  } catch (err) {
    console.error('Error fetching subject scores summary:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
