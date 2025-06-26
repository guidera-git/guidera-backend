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
        p.standardized_title,
        p.program_description,
        p.program_duration,
        p.credit_hours,
        p.fee,
        p.calculated_total_fee,
        p.important_dates,
        p.merit,
        p.teaching_system,
        p.admission_criteria,
        p.merit_formula,
        p.course_outline,
        u.id          AS university_id,
        u.university_title,
        u.main_link,
        u.location,
        u.additional_locations,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction,
        u.campuses
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      ORDER BY u.university_title ASC, p.standardized_title ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching all programs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 2) ALL UNIVERSITIES ────────────────────────────────────────────────────────
router.get('/universities', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT 
        u.*,
        COUNT(p.id) AS program_count
      FROM universities u
      LEFT JOIN programs p ON u.id = p.university_id
      GROUP BY u.id
      ORDER BY u.university_title ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching universities:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 3) FUZZY SEARCH UNIVERSITIES BY NAME ──────────────────────────────────────
router.get('/universities/search/:name', auth, async (req, res) => {
  const { name } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT u.*,
             COUNT(p.id) AS program_count
      FROM universities u
      LEFT JOIN programs p ON u.id = p.university_id
      WHERE u.university_title ILIKE $1
      GROUP BY u.id
      ORDER BY u.university_title ASC
      LIMIT 50
      `,
      [`%${name}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error searching universities:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 4) PROGRAMS BY UNIVERSITY ──────────────────────────────────────────────────
router.get('/programs/byUniversity/:universityId', auth, async (req, res) => {
  const { universityId } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT 
        p.*, 
        u.university_title, 
        u.location,
        u.main_link,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.university_id = $1
      ORDER BY p.standardized_title ASC
      `,
      [universityId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching programs by university:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 5) FUZZY SEARCH PROGRAMS BY TITLE ──────────────────────────────────────────
router.get('/programs/search/:programTitle', auth, async (req, res) => {
  const { programTitle } = req.params;
  try {
    const { rows } = await client.query(
      `
      SELECT
        p.id           AS program_id,
        p.program_title,
        p.standardized_title,
        p.program_description,
        p.calculated_total_fee,
        u.id           AS university_id,
        u.university_title,
        u.location,
        u.qs_ranking
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.program_title ILIKE $1
         OR p.standardized_title ILIKE $1
      ORDER BY p.standardized_title ASC
      LIMIT 50
      `,
      [`%${programTitle}%`]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error searching programs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 6) FULL DETAILS FOR ONE PROGRAM ────────────────────────────────────────────
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
        u.location,
        u.additional_locations,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction,
        u.campuses
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

// ─── 7) COMBINED FILTER ENDPOINT ────────────────────────────────────────────────
router.get('/programs/filter', auth, async (req, res) => {
  try {
    const {
      location,
      university_title,
      program_title,
      qs_ranking,
      min_total_fee,
      max_total_fee,
      standardized_title
    } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    // Filter by university location
    if (location) {
      conditions.push(`u.location = $${idx}`);
      values.push(location);
      idx++;
    }

    // Filter by university title
    if (university_title) {
      conditions.push(`LOWER(u.university_title) LIKE LOWER($${idx})`);
      values.push(`%${university_title}%`);
      idx++;
    }

    // Filter by program title (search both original and standardized)
    if (program_title) {
      conditions.push(`(LOWER(p.program_title) LIKE LOWER($${idx}) OR LOWER(p.standardized_title) LIKE LOWER($${idx}))`);
      values.push(`%${program_title}%`);
      idx++;
    }

    // Filter by standardized title specifically
    if (standardized_title) {
      conditions.push(`LOWER(p.standardized_title) LIKE LOWER($${idx})`);
      values.push(`%${standardized_title}%`);
      idx++;
    }

    // Filter by QS ranking
    if (qs_ranking) {
      conditions.push(`u.qs_ranking IS NOT NULL AND CAST(u.qs_ranking AS INTEGER) <= $${idx}`);
      values.push(parseInt(qs_ranking, 10));
      idx++;
    }

    // Filter by calculated total fee range
if (min_total_fee || max_total_fee) {
  // First check if the calculated_total_fee contains at least one digit
  const feeCondition = `
    p.calculated_total_fee IS NOT NULL 
    AND p.calculated_total_fee ~ '[0-9]'
    AND CAST(NULLIF(REGEXP_REPLACE(p.calculated_total_fee, '[^0-9]', '', 'g'), '') AS INTEGER)
  `;

  if (min_total_fee && max_total_fee) {
    conditions.push(`${feeCondition} BETWEEN $${idx} AND $${idx+1}`);
    values.push(parseInt(min_total_fee, 10), parseInt(max_total_fee, 10));
    idx += 2;
  } else if (min_total_fee) {
    conditions.push(`${feeCondition} >= $${idx}`);
    values.push(parseInt(min_total_fee, 10));
    idx++;
  } else if (max_total_fee) {
    conditions.push(`${feeCondition} <= $${idx}`);
    values.push(parseInt(max_total_fee, 10));
    idx++;
  }
}

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id            AS program_id,
        p.program_key,
        p.program_title,
        p.standardized_title,
        p.program_description,
        p.program_duration,
        p.credit_hours,
        p.fee,
        p.calculated_total_fee,
        p.important_dates,
        p.merit,
        p.teaching_system,
        p.admission_criteria,
        p.merit_formula,
        p.course_outline,
        u.id            AS university_id,
        u.university_title,
        u.main_link,
        u.location,
        u.additional_locations,
        u.qs_ranking,
        u.social_links,
        u.contact_details,
        u.introduction,
        u.campuses
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      ${whereClause}
      ORDER BY u.university_title ASC, p.standardized_title ASC
    `;

    const { rows } = await client.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('Error in programs filter:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 8) GET UNIQUE LOCATIONS ────────────────────────────────────────────────────
router.get('/locations', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT DISTINCT location
      FROM universities 
      WHERE location IS NOT NULL 
        AND location != ''
      ORDER BY location ASC
    `);
    const locations = rows.map(row => row.location);
    res.json(locations);
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 9) GET UNIQUE UNIVERSITY NAMES ─────────────────────────────────────────────
router.get('/university-names', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT DISTINCT university_title
      FROM universities 
      ORDER BY university_title ASC
    `);
    const names = rows.map(row => row.university_title);
    res.json(names);
  } catch (err) {
    console.error('Error fetching university names:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 10) GET UNIQUE PROGRAM NAMES ───────────────────────────────────────────────
router.get('/program-names', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT DISTINCT standardized_title
      FROM programs 
      WHERE standardized_title IS NOT NULL
        AND standardized_title != ''
      ORDER BY standardized_title ASC
    `);
    const names = rows.map(row => row.standardized_title);
    res.json(names);
  } catch (err) {
    console.error('Error fetching program names:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 11) GET PROGRAM STATISTICS ─────────────────────────────────────────────────
router.get('/statistics', auth, async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_universities,
        COUNT(DISTINCT p.id) as total_programs,
        COUNT(DISTINCT u.location) as total_locations,
        COUNT(DISTINCT p.standardized_title) as unique_program_types
      FROM universities u
      LEFT JOIN programs p ON u.id = p.university_id
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;