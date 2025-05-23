// src/routes/profile.js

const express = require('express');
const router  = express.Router();
const client  = require('../db');

/**
 * GET /api/user/profile
 * Fetch the logged-in student's profile.
 */
router.get('/user/profile', async (req, res) => {
  const studentId = req.user.id;

  try {
    const { rows } = await client.query(
      `SELECT
         student_id      AS id,
         full_name       AS fullName,
         email,
         profile_photo   AS profilePhoto,
         background_photo AS backgroundPhoto,
         gender,
         birthdate,
         about_me        AS aboutMe
       FROM student
       WHERE student_id = $1`,
      [studentId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/user/profile
 * Update any combination of:
 *   fullName, profilePhoto, backgroundPhoto, gender, birthdate, aboutMe
 *
 * To delete a photo via patch, set that field to null:
 *   { "profilePhoto": null }
 */
router.patch('/user/profile', async (req, res) => {
  const studentId = req.user.id;
  const {
    fullName,
    profilePhoto,
    backgroundPhoto,
    gender,
    birthdate,
    aboutMe
  } = req.body;

  // Build dynamic SET clause
  const fields = [];
  const values = [];
  let idx = 1;

  if (fullName !== undefined) {
    fields.push(`full_name = $${idx++}`);
    values.push(fullName);
  }
  if (profilePhoto !== undefined) {
    fields.push(`profile_photo = $${idx++}`);
    values.push(profilePhoto);
  }
  if (backgroundPhoto !== undefined) {
    fields.push(`background_photo = $${idx++}`);
    values.push(backgroundPhoto);
  }
  if (gender !== undefined) {
    fields.push(`gender = $${idx++}`);
    values.push(gender);
  }
  if (birthdate !== undefined) {
    fields.push(`birthdate = $${idx++}`);
    values.push(birthdate);
  }
  if (aboutMe !== undefined) {
    fields.push(`about_me = $${idx++}`);
    values.push(aboutMe);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update' });
  }

  // Add the studentId for the WHERE clause
  values.push(studentId);

  const sql = `
    UPDATE student
       SET ${fields.join(', ')}
     WHERE student_id = $${idx}
     RETURNING
       student_id      AS id,
       full_name       AS fullName,
       email,
       profile_photo   AS profilePhoto,
       background_photo AS backgroundPhoto,
       gender,
       birthdate,
       about_me        AS aboutMe
  `;

  try {
    const { rows } = await client.query(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/user/profile/photo
 * Remove only the profile photo (sets profile_photo = NULL).
 */
router.delete('/user/profile/photo', async (req, res) => {
  const studentId = req.user.id;

  try {
    const { rowCount } = await client.query(
      `UPDATE student
          SET profile_photo = NULL
        WHERE student_id = $1`,
      [studentId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting profile photo:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/user/profile/background-photo
 * Remove only the background photo (sets background_photo = NULL).
 */
router.delete('/user/profile/background-photo', async (req, res) => {
  const studentId = req.user.id;

  try {
    const { rowCount } = await client.query(
      `UPDATE student
          SET background_photo = NULL
        WHERE student_id = $1`,
      [studentId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting background photo:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
