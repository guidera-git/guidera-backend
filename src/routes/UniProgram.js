const express = require('express');
const router = express.Router();
const client = require('../db');

router.get('/universities', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM universities');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching universities:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/universities/:id/programs', async (req, res) => {
    const universityId = req.params.id;
    try {
        const result = await client.query(
            'SELECT * FROM programs WHERE university_id = $1',
            [universityId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching programs:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get all universities offering a specific program
router.get('/programs/:program_key/universities', async (req, res) => {
    const programKey = req.params.program_key.toLowerCase(); // Ensure case-insensitive comparison
    try {
        const result = await client.query(
            `SELECT 
                u.id AS university_id,
                u.university_title,
                u.main_link,
                u.qs_ranking,
                u.social_links,
                u.contact_details,
                u.introduction,
                u.campuses,
                p.id AS program_id,
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
                p.course_outline
            FROM 
                universities u
            JOIN 
                programs p ON u.id = p.university_id
            WHERE 
                LOWER(p.program_key) = $1`,
            [programKey]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching universities for program:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;
