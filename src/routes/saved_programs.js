  const express = require('express');
  const router = express.Router();
  const client = require('../db');
  const auth = require('../middleware/auth');

  // Utility to extract student ID from the token payload
  function getStudentId(req) {
    // Try all possible token claim fields
    return req.user.student_id ?? req.user.userId ?? req.user.id;
  }

  // ─── 1) SAVE A PROGRAM ───────────────────────────────────────────────────────────
  router.post('/saved-programs', auth, async (req, res) => {
    try {
      console.log('Authenticated payload:', req.user);
      const student_id = getStudentId(req);
      if (!student_id) {
        return res.status(401).json({ error: 'Invalid authentication payload' });
      }

      const { program_id, university_id } = req.body;
      if (!program_id || !university_id) {
        return res.status(400).json({ error: 'program_id and university_id are required' });
      }

      // Check if already saved
      const existingQuery = `
        SELECT id FROM saved_programs 
        WHERE student_id = $1 AND program_id = $2
      `;
      const existing = await client.query(existingQuery, [student_id, program_id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Program already saved' });
      }

      // Insert new saved program
      const insertQuery = `
        INSERT INTO saved_programs (student_id, program_id, university_id, saved_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *
      `;
      const result = await client.query(insertQuery, [student_id, program_id, university_id]);

      return res.status(201).json({ 
        message: 'Program saved successfully',
        saved_program: result.rows[0]
      });
    } catch (err) {
      console.error('Error saving program:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── 2) GET ALL SAVED PROGRAMS FOR USER ─────────────────────────────────────────
  router.get('/saved-programs', auth, async (req, res) => {
    try {
      const student_id = getStudentId(req);
      if (!student_id) {
        return res.status(401).json({ error: 'Invalid authentication payload' });
      }

      const query = `
        SELECT 
          sp.id as saved_id,
          sp.saved_at,
          p.id as program_id,
          p.program_title,
          p.standardized_title,
          p.program_duration,
          p.credit_hours,
          p.calculated_total_fee,
          p.important_dates,
          u.id as university_id,
          u.university_title,
          u.location,
          u.qs_ranking
        FROM saved_programs sp
        JOIN programs p ON sp.program_id = p.id
        JOIN universities u ON sp.university_id = u.id
        WHERE sp.student_id = $1
        ORDER BY sp.saved_at DESC
      `;

      const result = await client.query(query, [student_id]);
      return res.json(result.rows);
    } catch (err) {
      console.error('Error fetching saved programs:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── 3) UNSAVE A PROGRAM ─────────────────────────────────────────────────────────
  //    Now unsaves by saved_program record ID (saved_id)
  router.delete('/saved-programs/:saved_id', auth, async (req, res) => {
    try {
      const student_id = getStudentId(req);
      if (!student_id) {
        return res.status(401).json({ error: 'Invalid authentication payload' });
      }

      const { saved_id } = req.params;
      const deleteQuery = `
        DELETE FROM saved_programs 
        WHERE id = $1 AND student_id = $2
        RETURNING *
      `;
      const result = await client.query(deleteQuery, [saved_id, student_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Saved program not found' });
      }

      return res.json({ message: 'Program unsaved successfully' });
    } catch (err) {
      console.error('Error unsaving program:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── 4) CHECK IF PROGRAM IS SAVED ───────────────────────────────────────────────
  router.get('/saved-programs/check/:program_id', auth, async (req, res) => {
    try {
      const student_id = getStudentId(req);
      if (!student_id) {
        return res.status(401).json({ error: 'Invalid authentication payload' });
      }

      const { program_id } = req.params;
      const query = `
        SELECT id FROM saved_programs 
        WHERE student_id = $1 AND program_id = $2
      `;
      const result = await client.query(query, [student_id, program_id]);

      return res.json({ is_saved: result.rows.length > 0 });
    } catch (err) {
      console.error('Error checking saved status:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  module.exports = router;
