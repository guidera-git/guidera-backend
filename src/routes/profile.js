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

router.get('/:userId/profile', async (req, res) => {
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

router.put('/:userId/profile', upload.fields([
    { name: 'profile_image', maxCount: 1 },
    { name: 'background_image', maxCount: 1 }
]), async (req, res) => {
    const { userId } = req.params;
    const { full_name, email, date_of_birth, about_me } = req.body;

    const profileImageUrl = req.files['profile_image']?.[0]?.path;
    const backgroundImageUrl = req.files['background_image']?.[0]?.path;

    try {
        // Update users table
        const userUpdateQuery = `
            UPDATE users
            SET full_name = COALESCE($1, full_name),
                email = COALESCE($2, email)
            WHERE id = $3;
        `;

        const userValues = [
            full_name || null,
            email || null,
            userId
        ];

        // Update userdata table
        const userdataUpdateQuery = `
            UPDATE userdata
            SET date_of_birth = COALESCE($1, date_of_birth),
                about_me = COALESCE($2, about_me),
                profile_image_url = COALESCE($3, profile_image_url),
                background_image_url = COALESCE($4, background_image_url)
            WHERE user_id = $5
            RETURNING *;
        `;

        const userdataValues = [
            date_of_birth || null,
            about_me || null,
            profileImageUrl || null,
            backgroundImageUrl || null,
            userId
        ];

        await client.query('BEGIN');
        await client.query(userUpdateQuery, userValues);
        const result = await client.query(userdataUpdateQuery, userdataValues);
        await client.query('COMMIT');

        res.status(200).json({ message: 'Profile updated successfully' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});




module.exports = router;
