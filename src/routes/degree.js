// src/routes/degree.js

const express        = require('express');
const { PythonShell } = require('python-shell');
const pool           = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All /degree routes require a valid JWT
router.use(authMiddleware);

/**
 * POST /api/degree/predict
 * Body JSON must include the 11 model-input fields:
 *   Gender, Academic Percentage, Study Stream,
 *   Analytical, Logical, Explaining, Creative,
 *   Detail-Oriented, Helping, Activity Preference, Project Preference
 */
router.post('/degree/predict', async (req, res, next) => {
  const inputs    = req.body;
  const studentId = req.user.id;

  // Acquire a client from the pool for transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Insert the raw request
    const insertReqSQL = `
      INSERT INTO degree_requests (
        student_id,
        gender,
        academic_percentage,
        study_stream,
        analytical,
        logical,
        explaining,
        creative,
        detail_oriented,
        helping,
        activity_preference,
        project_preference
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      ) RETURNING request_id
    `;
    const insertReqValues = [
      studentId,
      inputs["Gender"],
      inputs["Academic Percentage"],
      inputs["Study Stream"],
      inputs["Analytical"],
      inputs["Logical"],
      inputs["Explaining"],
      inputs["Creative"],
      inputs["Detail-Oriented"],
      inputs["Helping"],
      inputs["Activity Preference"],
      inputs["Project Preference"]
    ];
    const reqResult = await client.query(insertReqSQL, insertReqValues);
    const requestId = reqResult.rows[0].request_id;

    // 2) Call the Python predictor script
    const pyshell = new PythonShell('predictor.py', {
      mode: 'json',
      pythonOptions: ['-u'],  // unbuffered stdout
      cwd: __dirname + '/../../predictor'
    });

    const prediction = await new Promise((resolve, reject) => {
      pyshell.send(inputs);
      pyshell.on('message', msg => resolve(msg));
      pyshell.on('error', err => reject(err));
      pyshell.end(err => err && reject(err));
    });

    const { predicted_degree, confidence_score } = prediction;

    // 3) Insert the prediction
    const insertRecSQL = `
      INSERT INTO degree_recommendations (
        request_id,
        predicted_degree,
        confidence_score
      ) VALUES ($1,$2,$3)
      RETURNING recommendation_id
    `;
    const recResult = await client.query(insertRecSQL, [
      requestId,
      predicted_degree,
      confidence_score
    ]);
    const recommendationId = recResult.rows[0].recommendation_id;

    await client.query('COMMIT');

    // 4) Return the result
    res.json({
      recommendation_id: recommendationId,
      predicted_degree,
      confidence_score
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
