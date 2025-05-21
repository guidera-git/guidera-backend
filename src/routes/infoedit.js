const express = require('express');
const router = express.Router();
const client = require('../db');

// ✅ GET user info and traits
router.get('/:userId/full', async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await client.query(`
            SELECT 
                u.full_name,
                u.email,
                ud.about_me,
                ud.date_of_birth,
                ud.gender,
                ud.location,
                ud.student_type,
                ud.matric_o,
                ud.inter_a,
                ud.study_stream,
                ud.analytical,
                ud.logical,
                ud.explaining,
                ud.creative,
                ud.detail_oriented,
                ud.helping,
                ud.activity_preference,
                ud.project_preference,
                ud.profile_image_url,
                ud.background_image_url
            FROM users u
            JOIN userdata ud ON u.id = ud.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user info:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ PUT user info and traits
router.put('/:userId/full', async (req, res) => {
    const { userId } = req.params;
    const {
        full_name,
        email,
        about_me,
        date_of_birth,
        gender,
        location,
        student_type,
        matric_o,
        inter_a,
        study_stream,
        analytical,
        logical,
        explaining,
        creative,
        detail_oriented,
        helping,
        activity_preference,
        project_preference,
        profile_image_url,
        background_image_url
    } = req.body;

    try {
        // Update `users` table
        await client.query(`
            UPDATE users
            SET full_name = COALESCE($1, full_name),
                email = COALESCE($2, email)
            WHERE id = $3
        `, [full_name, email, userId]);

        // Update `userdata` table
        const result = await client.query(`
            UPDATE userdata SET
                about_me = COALESCE($1, about_me),
                date_of_birth = COALESCE($2, date_of_birth),
                gender = COALESCE($3, gender),
                location = COALESCE($4, location),
                student_type = COALESCE($5, student_type),
                matric_o = COALESCE($6, matric_o),
                inter_a = COALESCE($7, inter_a),
                study_stream = COALESCE($8, study_stream),
                analytical = COALESCE($9, analytical),
                logical = COALESCE($10, logical),
                explaining = COALESCE($11, explaining),
                creative = COALESCE($12, creative),
                detail_oriented = COALESCE($13, detail_oriented),
                helping = COALESCE($14, helping),
                activity_preference = COALESCE($15, activity_preference),
                project_preference = COALESCE($16, project_preference),
                profile_image_url = COALESCE($17, profile_image_url),
                background_image_url = COALESCE($18, background_image_url)
            WHERE user_id = $19
            RETURNING *;
        `, [
            about_me,
            date_of_birth,
            gender,
            location,
            student_type,
            matric_o,
            inter_a,
            study_stream,
            analytical,
            logical,
            explaining,
            creative,
            detail_oriented,
            helping,
            activity_preference,
            project_preference,
            profile_image_url,
            background_image_url,
            userId
        ]);

        res.status(200).json({ message: 'User info updated successfully', updated: result.rows[0] });
    } catch (err) {
        console.error('Error updating user info:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
