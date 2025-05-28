const express = require('express');
const router = express.Router();
const client = require('../db');
const auth = require('../middleware/auth'); // Assumes JWT adds student_id to req.user

// ✅ GET all favorite programs for the authenticated student
router.get('/cart', auth, async (req, res) => {
    const studentId = req.user.id;

    try {
        const { rows } = await client.query(`
            SELECT 
                f.id AS favorite_id,
                p.*,
                u.university_title
            FROM favorites f
            JOIN programs p ON f.program_id = p.id
            JOIN universities u ON u.id = p.university_id
            WHERE f.student_id = $1
        `, [studentId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching favorites:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ POST: Add a program to favorites
router.post('/cart', auth, async (req, res) => {
    const studentId = req.user.id;
    const { program_id } = req.body;

    if (!program_id) {
        return res.status(400).json({ error: 'program_id is required' });
    }

    try {
        await client.query(`
            INSERT INTO favorites (student_id, program_id)
            VALUES ($1, $2)
            ON CONFLICT (student_id, program_id) DO NOTHING
        `, [studentId, program_id]);

        res.status(201).json({ message: 'Program added to favorites' });
    } catch (err) {
        console.error('Error adding favorite:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.delete('/cart/:programId', auth, async (req, res) => {
    const studentId = req.user.id;
    const programId = req.params.programId;

    try {
        const result = await client.query(`
            DELETE FROM favorites 
            WHERE student_id = $1 AND program_id = $2
        `, [studentId, programId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Favorite not found' });
        }

        res.json({ message: 'Program removed from favorites' });
    } catch (err) {
        console.error('Error deleting favorite:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
