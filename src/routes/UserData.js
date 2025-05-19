const express = require('express');
const router = express.Router();
const client = require('../db');  // your PG client

// POST /api/userdata
router.post('/userdata', async (req, res) => {
    const {
        user_id,
        full_name,
        email,
        about_me,
        date_of_birth,
        gender,
        location,
        student_type,
        matric_O,
        inter_A,
        study_stream,
        analytical,
        logical,
        explaining,
        creative,
        detail_oriented,
        helping,
        activity_preference,
        project_preference
    } = req.body;

    if (!user_id || !full_name || !email) {
        return res.status(400).json({ error: 'user_id, full_name, and email are required' });
    }

    try {
        const insertQuery = `
            INSERT INTO userdata (
                user_id, full_name, email, about_me, date_of_birth, gender, location, student_type,
                matric_O, inter_A, study_stream,
                analytical, logical, explaining, creative, detail_oriented, helping,
                activity_preference, project_preference
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
            ) RETURNING *;
        `;

        const values = [
            user_id, full_name, email, about_me, date_of_birth, gender, location, student_type,
            matric_O, inter_A, study_stream,
            analytical, logical, explaining, creative, detail_oriented, helping,
            activity_preference, project_preference
        ];

        const result = await client.query(insertQuery, values);
        res.status(201).json({ message: 'User data inserted successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error inserting user data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
