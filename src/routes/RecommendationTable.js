const express = require('express');
const router = express.Router();
const client = require('../db');

const multer = require('multer');
// Storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // folder where images will be saved
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // rename file
    }
});

const upload = multer({ storage: storage });
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

router.post('/userdata/:userId', upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'background_image', maxCount: 1 }
]), async (req, res) => {
    const {
        user_id,
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

    const profileImageUrl = req.files['profile_image']?.[0]?.path;
    const backgroundImageUrl = req.files['background_image']?.[0]?.path;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    try {
        const insertQuery = `
      INSERT INTO userdata (
        user_id, profile_image_url, background_image_url, about_me, date_of_birth, gender,
        location, student_type, matric_O, inter_A, study_stream,
        analytical, logical, explaining, creative, detail_oriented, helping,
        activity_preference, project_preference
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      ) RETURNING *;
    `;

        const values = [
            user_id, profileImageUrl, backgroundImageUrl, about_me, date_of_birth, gender,
            location, student_type, matric_O, inter_A, study_stream,
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
