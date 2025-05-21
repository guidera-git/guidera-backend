// routes/applications.js
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');   // only once
const client  = require('../db');


// allowed stage keys for PATCH
const STAGE_KEYS = new Set([
  'submitted',
  'test_scheduled',
  'test_taken',
  'interview_scheduled',
  'interview_completed',
  'offer_received',
  'offer_accepted'
]);

// 1) CREATE: start a new application
// POST /api/applications
// body: { programId: number }
router.post('/applications', async (req, res) => {
  const userId = req.user.id;                     // assume auth middleware
  const { programId } = req.body;

  try {
    const { rows } = await client.query(
      `INSERT INTO applications (saved_program_id)
         VALUES (
           (SELECT id FROM saved_programs
              WHERE user_id = $1
                AND program_id = $2)
         )
       ON CONFLICT DO NOTHING
       RETURNING *;`,
      [userId, programId]
    );

    if (!rows[0]) {
      return res
        .status(400)
        .json({ error: 'Either not saved or application already exists.' });
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 2) READ: get one application by ID
// GET /api/applications/:appId
router.get('/applications/:appId', async (req, res) => {
  try {
    const { rows } = await client.query(
      `SELECT * FROM applications
         WHERE id = $1
           AND (  -- ensure user only sees their own
             EXISTS (
               SELECT 1 FROM saved_programs sp
               WHERE sp.id = applications.saved_program_id
                 AND sp.user_id = $2
             )
           )`,
      [req.params.appId, req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 2b) READ ALL for current user
// GET /api/applications
router.get('/applications', async (req, res) => {
  try {
    const { rows } = await client.query(
      `SELECT a.* 
         FROM applications a
         JOIN saved_programs sp
           ON sp.id = a.saved_program_id
         WHERE sp.user_id = $1
         ORDER BY a.started_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 3) UPDATE: mark stage complete / add note
// PATCH /api/applications/:appId/stages/:stageKey
// body: { note?: string }
router.patch('/applications/:appId/stages/:stageKey', async (req, res) => {
  const { stageKey } = req.params;
  if (!STAGE_KEYS.has(stageKey)) {
    return res.status(400).json({ error: 'Invalid stage key.' });
  }

  const boolCol = stageKey;
  const atCol   = `${stageKey}_at`;
  const noteCol = `${stageKey}_note`;
  const note    = req.body.note || '';

  const sql = `
    UPDATE applications a
       SET ${boolCol}   = TRUE,
           ${atCol}     = NOW(),
           ${noteCol}   = COALESCE(a.${noteCol} || '\n','') || $1
     FROM saved_programs sp
     WHERE a.id = $2
       AND a.saved_program_id = sp.id
       AND sp.user_id = $3
     RETURNING a.*;`;

  try {
    const { rows } = await client.query(sql, [
      note,
      req.params.appId,
      req.user.id,
    ]);

    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 4) DELETE: withdraw an application
// DELETE /api/applications/:appId
router.delete('/applications/:appId', async (req, res) => {
  try {
    const { rowCount } = await client.query(
      `DELETE FROM applications a
         USING saved_programs sp
        WHERE a.id = $1
          AND a.saved_program_id = sp.id
          AND sp.user_id = $2;`,
      [req.params.appId, req.user.id]
    );

    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
