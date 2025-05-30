const express = require('express');
const router = express.Router();
const client = require('../db');
const auth = require('../middleware/auth'); // Your JWT middleware

// GET all universities
router.get('/universities', auth, async (req, res) => {
    try {
        const { rows } = await client.query('SELECT * FROM universities ORDER BY university_title ASC');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// SEARCH university by name
router.get('/universities/search/', auth, async (req, res) => {
    const { name } = req.params;
    try {
        const { rows } = await client.query(
            `SELECT * FROM universities WHERE LOWER(university_title) LIKE LOWER($1)`,
            [`%${name}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// GET all programs of a specific university
router.get('/universities/programs', auth, async (req, res) => {
    const { universityId } = req.params;
    try {
        const { rows } = await client.query(
            `SELECT * FROM programs WHERE university_id = $1 ORDER BY program_title ASC`,
            [universityId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// SEARCH programs by degree name (program_title)
router.get('/programs/search/', auth, async (req, res) => {
    const { degreeName } = req.params;
    try {
        const { rows } = await client.query(
            `SELECT p.*, u.university_title 
       FROM programs p
       JOIN universities u ON u.id = p.university_id
       WHERE LOWER(p.program_title) LIKE LOWER($1)
       ORDER BY p.program_title ASC`,
            [`%${degreeName}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET full program details by programId
router.get('/programs/specific', auth, async (req, res) => {
    const { programId } = req.params;
    try {
        const { rows } = await client.query(
            `
      SELECT p.*, u.*
      FROM programs p
      JOIN universities u ON u.id = p.university_id
      WHERE p.id = $1
      `,
            [programId]
        );

        if (!rows[0]) return res.status(404).json({ error: 'Program not found' });

        const row = rows[0];

        // Extract university fields (adjust based on your schema)
        const university = {
            id: row.id,  // university id will clash with program.id, so you may want to rename these keys
            university_title: row.university_title,
            main_link: row.main_link,
            qs_ranking: row.qs_ranking,
            social_links: row.social_links,
            contact_details: row.contact_details,
            introduction: row.introduction,
            campuses: row.campuses,
        };

        // Extract program fields, removing university fields
        const program = {
            id: row.id,  // clash! So better rename one of them below
            university_id: row.university_id,
            program_key: row.program_key,
            program_title: row.program_title,
            program_description: row.program_description,
            program_duration: row.program_duration,
            credit_hours: row.credit_hours,
            fee: row.fee,
            important_dates: row.important_dates,
            merit: row.merit,
            teaching_system: row.teaching_system,
            admission_criteria: row.admission_criteria,
            merit_formula: row.merit_formula,
            course_outline: row.course_outline,
        };

        // Rename to avoid clash:
        university.id = university.id; // university id stays
        program.id = program.id;       // program id stays (both are 51 here so this is ambiguous)

        res.json({ program, university });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /universities/ranking

// GET universities with optional location filter
// GET universities filtered by location (query param 'location' case-insensitive)
/*
router.get('/universities/filter', auth, async (req, res) => {
    const location = req.query.location || req.query.Location;

    if (!location) {
        return res.status(400).json({ error: 'Location query parameter is required' });
    }

    try {
        const { rows } = await client.query(
            `
      SELECT *
      FROM universities
      WHERE EXISTS (
        SELECT 1 FROM unnest(locations) AS loc WHERE LOWER(loc) = LOWER($1)
      )
      ORDER BY university_title ASC
      `,
            [location]
        );

        res.json(rows);
    } catch (error) {
        console.error('Error fetching universities by location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET all universities sorted by QS Ranking (ascending)
router.get('/universities/sorted/qs-ranking', auth, async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM universities
            ORDER BY 
              CASE 
                WHEN qs_ranking ~ '^[0-9]+$' THEN CAST(qs_ranking AS INTEGER)
                ELSE NULL
              END ASC
        `;

        const { rows } = await client.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching universities by qs_ranking:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// routes/programs.js

// Total Tuition Fee filter
router.get('/programs/filter-by-total-fee', async (req, res) => {
    try {
        const { min, max } = req.query;
        if (!min || !max) {
            return res.status(400).json({ error: 'Min and max are required' });
        }

        const result = await client.query(
            `
      SELECT * FROM programs
      WHERE 
        REGEXP_REPLACE(fee->0->>'total_tution_fee', '[^0-9]', '', 'g') ~ '^[0-9]+$'
        AND CAST(REGEXP_REPLACE(fee->0->>'total_tution_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $1 AND $2
      `,
            [min, max]
        );

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// routes/programs.js (same file, continue)

router.get('/programs/filter-by-credit-fee', async (req, res) => {
    try {
        const { min, max } = req.query;
        if (!min || !max) {
            return res.status(400).json({ error: 'Min and max are required' });
        }

        const result = await client.query(
            `
      SELECT * FROM programs
      WHERE 
        REGEXP_REPLACE(fee->0->>'per_credit_hour_fee', '[^0-9]', '', 'g') ~ '^[0-9]+$'
        AND CAST(REGEXP_REPLACE(fee->0->>'per_credit_hour_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $1 AND $2
      `,
            [min, max]
        );

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
*/
router.get('/universities/programs/filter', auth, async (req, res) => {
    try {
        const {
            location,
            university_title,
            program_title,
            min_total_fee,
            max_total_fee,
            min_credit_fee,
            max_credit_fee,
            qs_ranking
        } = req.query;

        const conditions = [];
        const values = [];
        let idx = 1;

        if (location) {
            conditions.push(`EXISTS (SELECT 1 FROM unnest(u.locations) AS loc WHERE LOWER(loc) = LOWER($${idx}))`);
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
            conditions.push(`u.qs_ranking = $${idx}`);
            values.push(qs_ranking);
            idx++;
        }

        if (min_total_fee && max_total_fee) {
            conditions.push(`
        REGEXP_REPLACE(p.fee->0->>'total_tution_fee', '[^0-9]', '', 'g') ~ '^[0-9]+$' AND
        CAST(REGEXP_REPLACE(p.fee->0->>'total_tution_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $${idx} AND $${idx + 1}
      `);
            values.push(min_total_fee, max_total_fee);
            idx += 2;
        }

        if (min_credit_fee && max_credit_fee) {
            conditions.push(`
        REGEXP_REPLACE(p.fee->0->>'per_credit_hour_fee', '[^0-9]', '', 'g') ~ '^[0-9]+$' AND
        CAST(REGEXP_REPLACE(p.fee->0->>'per_credit_hour_fee', '[^0-9]', '', 'g') AS INTEGER)
        BETWEEN $${idx} AND $${idx + 1}
      `);
            values.push(min_credit_fee, max_credit_fee);
            idx += 2;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
      SELECT u.*, p.*
      FROM universities u
      JOIN programs p ON p.university_id = u.id
      ${whereClause}
      ORDER BY u.university_title ASC
    `;

        const { rows } = await client.query(query, values);
        res.json(rows);
    } catch (err) {
        console.error('Error in combined filter:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
