// routes/universities.js

const express = require('express');
const router = express.Router();
const client = require('../db');
const auth = require('../middleware/auth');

// ─── 1) ALL PROGRAMS WITH UNIVERSITY INFO ───────────────────────────────────────
router.get('/programs', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT 
        p.id          AS program_id,
        p.program_key,
        p.program_title,
        p.program_description,
        p.program_duration,
        p.credit_hours,
        p.fee,
        p.important_dates,
        p.merit,
        p.teaching_system,
        p.admission_criteria,
        p.merit_formula,
        p.course_outline,
        u.id          AS university_id,
        u.university_title,
        u.main_link,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction,
        u.campuses,
        u.location
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      ORDER BY u.university_title ASC, p.program_title ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching all programs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Fuzzy SEARCH universities by name ────────────────────────────────────────
router.get('/universities/search/:name', auth, async (req, res) => {
  const { name } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT *
        FROM universities
       WHERE university_title ILIKE $1
          OR university_title % $1
       ORDER BY similarity(university_title, $1) DESC,
                university_title ASC
       LIMIT 50
      `,
      [`%${name}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error searching universities (fuzzy):', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ─── 3) PROGRAMS BY UNIVERSITY ────────────────────────────────────────────────
router.get('/programs/byUniversity/:universityId', auth, async (req, res) => {
  const { universityId } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT 
        p.*, 
        u.university_title, 
        u.location 
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.university_id = $1
      ORDER BY p.program_title
      `,
      [universityId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching programs by university:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Fuzzy SEARCH programs by title ───────────────────────────────────────────
router.get('/programs/search/:programTitle', auth, async (req, res) => {
  const { programTitle } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT
        p.id           AS program_id,
        p.program_title,
        u.university_title,
        u.location
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.program_title ILIKE $1
         OR p.program_title % $1
      ORDER BY similarity(p.program_title, $1) DESC,
               p.program_title ASC
      LIMIT 50
      `,
      [`%${programTitle}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error searching programs (fuzzy):', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ─── 5) FULL DETAILS FOR ONE PROGRAM ──────────────────────────────────────────
router.get('/programs/specific/:programId', auth, async (req, res) => {
  const { programId } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT 
        p.*,
        u.id            AS university_id,
        u.university_title,
        u.main_link,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction,
        u.campuses,
        u.location
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.id = $1
      `,
      [programId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Program not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching program details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 6) COMBINED FILTER ENDPOINT ──────────────────────────────────────────────
router.get('/programs/filter', auth, async (req, res) => {
  try {
    const {
      location,
      university_title,
      program_title,
      qs_ranking,
      min_total_fee,
      max_total_fee,
      min_credit_fee,
      max_credit_fee
    } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    // filter by university.location
    if (location) {
      conditions.push(`u.location = $${idx}`);
      values.push(location);
      idx++;
    }

    if (university_title) {
      conditions.push(`LOWER(u.university_title) LIKE LOWER($${idx})`);
      values.push(`%${university_title}%`);
      idx++;
    }

    if (program_title) {
      conditions.push(`LOWER(p.program_title) LIKE LOWER($${idx})`);
      values.push(`%${program_title}%`);
      idx++;
    }

    if (qs_ranking) {
      conditions.push(`u.qs_ranking::int = $${idx}`);
      values.push(parseInt(qs_ranking, 10));
      idx++;
    }

    // fee JSONB path: p.fee->0->>'total_tution_fee'
    if (min_total_fee && max_total_fee) {
      conditions.push(`
        CAST(REGEXP_REPLACE(p.fee->0->>'total_tution_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $${idx} AND $${idx+1}
      `);
      values.push(parseInt(min_total_fee, 10), parseInt(max_total_fee, 10));
      idx += 2;
    }

    if (min_credit_fee && max_credit_fee) {
      conditions.push(`
        CAST(REGEXP_REPLACE(p.fee->0->>'per_credit_hour_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $${idx} AND $${idx+1}
      `);
      values.push(parseInt(min_credit_fee, 10), parseInt(max_credit_fee, 10));
      idx += 2;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id            AS program_id,
        p.program_key,
        p.program_title,
        p.program_duration,
        p.credit_hours,
        p.fee,
        u.id            AS university_id,
        u.university_title,
        u.location
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      ${whereClause}
      ORDER BY u.university_title, p.program_title
    `;

    const { rows } = await client.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('Error in programs filter:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
