const express = require('express');
const router = express.Router();
const client = require('../db');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const userResult = await client.query(
            `SELECT full_name, email FROM users WHERE id = $1`,
            [userId]
        );

        const dataResult = await client.query(
            `SELECT date_of_birth, about_me, profile_image_url, background_image_url 
             FROM userdata WHERE user_id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profile = {
            ...userResult.rows[0],
            ...dataResult.rows[0]
        };

        res.status(200).json(profile);
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ PUT /api/profile/:userId
router.put('/:userId', upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'background_image', maxCount: 1 }
]), async (req, res) => {
    const { userId } = req.params;
    const { about_me, date_of_birth } = req.body;

    const profileImageUrl = req.files['profile_image']?.[0]?.path;
    const backgroundImageUrl = req.files['background_image']?.[0]?.path;

    try {
        const updateQuery = `
            UPDATE userdata
            SET 
                about_me = COALESCE($1, about_me),
                date_of_birth = COALESCE($2, date_of_birth),
                profile_image_url = COALESCE($3, profile_image_url),
                background_image_url = COALESCE($4, background_image_url)
            WHERE user_id = $5
            RETURNING *;
        `;

        const values = [
            about_me || null,
            date_of_birth || null,
            profileImageUrl || null,
            backgroundImageUrl || null,
            userId
        ];

        const result = await client.query(updateQuery, values);

        res.status(200).json({ message: 'Profile updated successfully', data: result.rows[0] });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;
