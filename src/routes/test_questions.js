// src/routes/test_questions.js

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db');
const router = express.Router();
const authenticate = require('../middleware/auth'); // JWT auth middleware

// Helper to format validation errors
const formatErrors = errs =>
  errs.map(e => ({ field: e.param, message: e.msg }));

// Constants for question distribution
const DIFFICULTY_DISTRIBUTION = {
  Easy: 2,
  Medium: 2,
  Hard: 1,
};

// GET /api/tests/:subject
// Start a new test attempt and fetch random questions for a subject
router.get(
  '/:subject',
  authenticate,
  param('subject').trim().notEmpty().withMessage('Subject is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: formatErrors(errors.array()) });
    }

    const { subject } = req.params;
    const userId = req.user.id;

    try {
      // Create new test attempt record
      const attemptRes = await pool.query(
        `INSERT INTO test_attempts (user_id, subject)
         VALUES ($1, $2)
         RETURNING attempt_id, started_at`,
        [userId, subject]
      );
      const attempt = attemptRes.rows[0];

      // Fetch random questions by difficulty
      const fetchedQuestions = [];
      for (const [difficulty, count] of Object.entries(DIFFICULTY_DISTRIBUTION)) {
        const result = await pool.query(
          `SELECT id, subject, question, options, difficulty
           FROM test_questions
           WHERE subject = $1 AND difficulty = $2
           ORDER BY RANDOM()
           LIMIT $3`,
          [subject, difficulty, count]
        );
        fetchedQuestions.push(...result.rows);
      }

      // Shuffle aggregated questions
      fetchedQuestions.sort(() => Math.random() - 0.5);

      // Return attempt ID and questions (without answers/explanations)
      return res.json({
        attemptId: attempt.attempt_id,
        startedAt: attempt.started_at,
        questions: fetchedQuestions,
        expectedCount: Object.values(DIFFICULTY_DISTRIBUTION).reduce((sum, count) => sum + count, 0)
      });

    } catch (err) {
      console.error('Error starting test:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/tests/:attemptId/submit
// Submit answers for a test attempt
router.post(
  '/:attemptId/submit',
  authenticate,
  param('attemptId').isUUID().withMessage('Invalid attempt ID'),
  body('answers').isObject().withMessage('Answers must be an object'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: formatErrors(errors.array()) });
    }

    const { attemptId } = req.params;
    const { answers } = req.body; // { questionId: selectedOption, ... }

    try {
      // Fetch correct answers and explanations
      const qIds = Object.keys(answers);
      const qsResult = await pool.query(
        `SELECT id, correct_ans, explanation
         FROM test_questions
         WHERE id = ANY($1::text[])`,
        [qIds]
      );
      const questionMap = qsResult.rows.reduce((acc, q) => {
        acc[q.id] = q;
        return acc;
      }, {});

      let correctCount = 0;
      const insertPromises = [];
      for (const [qid, selected] of Object.entries(answers)) {
        const correct = questionMap[qid].correct_ans;
        const isCorrect = selected === correct;
        if (isCorrect) correctCount++;

        insertPromises.push(
          pool.query(
            `INSERT INTO test_answers (attempt_id, question_id, selected_ans, is_correct)
             VALUES ($1, $2, $3, $4)`,
            [attemptId, qid, selected, isCorrect]
          )
        );
      }
      await Promise.all(insertPromises);

      // Update attempt record
      const score = Math.round((correctCount / qIds.length) * 100);
      await pool.query(
        `UPDATE test_attempts
         SET completed_at = NOW(), score = $1
         WHERE attempt_id = $2`,
        [score, attemptId]
      );

      return res.json({
        attemptId,
        total: qIds.length,
        correct: correctCount,
        score,
      });

    } catch (err) {
      console.error('Error submitting test:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/tests/:attemptId/result
// Retrieve results, including explanations and user's answers
router.get(
  '/:attemptId/result',
  authenticate,
  param('attemptId').isUUID().withMessage('Invalid attempt ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: formatErrors(errors.array()) });
    }

    const { attemptId } = req.params;

    try {
      // Fetch attempt summary
      const attemptRes = await pool.query(
        `SELECT attempt_id, subject, started_at, completed_at, score
         FROM test_attempts
         WHERE attempt_id = $1`,
        [attemptId]
      );
      if (attemptRes.rowCount === 0) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      const attempt = attemptRes.rows[0];

      // Fetch answers with question data
      const ansRes = await pool.query(
        `SELECT a.question_id AS id,
                q.question,
                q.options,
                a.selected_ans,
                q.correct_ans,
                q.explanation,
                a.is_correct
         FROM test_answers a
         JOIN test_questions q ON q.id = a.question_id
         WHERE a.attempt_id = $1`,
        [attemptId]
      );

      return res.json({
        attempt,
        results: ansRes.rows,
      });

    } catch (err) {
      console.error('Error fetching results:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
