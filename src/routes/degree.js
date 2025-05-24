const express      = require('express');
const { PythonShell } = require('python-shell');
const pool         = require('../db');      // your pg Pool instance
const router       = express.Router();

// POST /api/degree/predict
router.post('/degree/predict', async (req, res, next) => {
  const inputs = req.body;
  const {
    Gender, "Academic Percentage": AcademicPercentage,
    "Study Stream": StudyStream,
    Analytical, Logical, Explaining, Creative,
    "Detail-Oriented": DetailOriented,
    Helping, "Activity Preference": ActivityPreference,
    "Project Preference": ProjectPreference
  } = inputs;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) insert raw request
    const reqInsertText = `
      INSERT INTO degree_requests(
        student_id,
        gender, academic_percentage, study_stream,
        analytical, logical, explaining,
        creative, detail_oriented, helping,
        activity_preference, project_preference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING request_id
    `;
    // req.user.id was set by your auth middleware
    const reqResult = await client.query(reqInsertText, [
      req.user.id,
      Gender,
      AcademicPercentage,
      StudyStream,
      Analytical,
      Logical,
      Explaining,
      Creative,
      DetailOriented,
      Helping,
      ActivityPreference,
      ProjectPreference
    ]);
    const request_id = reqResult.rows[0].request_id;

    // 2) call Python predictor
    const pyshell = new PythonShell('predictor/predictor.py', {
      mode: 'json',
      pythonOptions: ['-u'],  // unbuffered stdout
      cwd: __dirname + '/../../predictor'
    });

    // send exactly one JSON to predictor
    pyshell.send(inputs);

    // wait for its reply
    const { predicted_degree, confidence_score } = await new Promise((resolve, reject) => {
      pyshell.on('message', msg => resolve(msg));
      pyshell.on('error', err   => reject(err));
      pyshell.end(err => { if(err) reject(err); });
    });

    // 3) insert the prediction
    const recInsertText = `
      INSERT INTO degree_recommendations(
        request_id, predicted_degree, confidence_score
      ) VALUES ($1, $2, $3)
      RETURNING recommendation_id
    `;
    const recResult = await client.query(recInsertText, [
      request_id,
      predicted_degree,
      confidence_score
    ]);
    const recommendation_id = recResult.rows[0].recommendation_id;

    await client.query('COMMIT');

    // 4) return to Flutter
    res.json({
      recommendation_id,
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
