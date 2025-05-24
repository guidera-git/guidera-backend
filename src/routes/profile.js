// src/routes/profile.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const client = require('../db');
const { uploadProfile, uploadBackground } = require('../middleware/upload');

// Helper to delete file from disk
function deleteFile(relPath) {
  const filePath = path.join(__dirname, '..', 'public', relPath.replace(/^\//, ''));
  fs.unlink(filePath, err => {
    if (err && err.code !== 'ENOENT') console.error('File deletion error:', err);
  });
}

// GET /api/user/profile
router.get('/user/profile', async (req, res) => {
  const studentId = req.user.id;
  try {
    const { rows } = await client.query(
      `SELECT student_id AS id, full_name AS fullname, email,
              profile_photo AS profilephoto,
              background_photo AS backgroundphoto,
              gender, birthdate, about_me AS aboutme
       FROM student
       WHERE student_id = $1`,
      [studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

    const host = `${req.protocol}://${req.get('host')}`;
    const profile = rows[0];
    if (profile.profilephoto && profile.profilephoto.startsWith('/')) {
      profile.profilephoto = host + profile.profilephoto;
    }
    if (profile.backgroundphoto && profile.backgroundphoto.startsWith('/')) {
      profile.backgroundphoto = host + profile.backgroundphoto;
    }

    res.json(profile);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/user/profile (metadata)
router.patch('/user/profile', async (req, res) => {
  const studentId = req.user.id;
  const { fullname, gender, birthdate, aboutme } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (fullname !== undefined) { fields.push(`full_name = $${idx}`); values.push(fullname); idx++; }
  if (gender !== undefined)   { fields.push(`gender = $${idx}`);    values.push(gender);   idx++; }
  if (birthdate !== undefined){ fields.push(`birthdate = $${idx}`); values.push(birthdate);idx++; }
  if (aboutme !== undefined)  { fields.push(`about_me = $${idx}`);  values.push(aboutme);  idx++; }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(studentId);
  const sql = `UPDATE student SET ${fields.join(', ')} WHERE student_id = $${idx} RETURNING *`;
  try {
    const { rows } = await client.query(sql, values);
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

    const host = `${req.protocol}://${req.get('host')}`;
    const p = rows[0];
    p.profilephoto    = p.profile_photo    ? host + p.profile_photo    : null;
    p.backgroundphoto = p.background_photo? host + p.background_photo : null;
    delete p.profile_photo;
    delete p.background_photo;

    res.json(p);
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/user/profile/photo
router.patch(
  '/user/profile/photo',
  uploadProfile.single('profilephoto'), // ensure field name matches client
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const studentId = req.user.id;
    const relPath = `/uploads/profiles/${req.file.filename}`;
    try {
      const old = await client.query(
        `SELECT profile_photo FROM student WHERE student_id = $1`,
        [studentId]
      );
      if (old.rows[0]?.profile_photo) deleteFile(old.rows[0].profile_photo);

      const { rows } = await client.query(
        `UPDATE student SET profile_photo = $1 WHERE student_id = $2 RETURNING profile_photo`,
        [relPath, studentId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

      const url = `${req.protocol}://${req.get('host')}${rows[0].profile_photo}`;
      res.json({ profilephoto: url });
    } catch (err) {
      console.error('Error uploading profile photo:', err);
      res.status(500).json({ error: 'Failed to update profile photo' });
    }
  }
);

// DELETE /api/user/profile/photo
router.delete('/user/profile/photo', async (req, res) => {
  const studentId = req.user.id;
  try {
    const old = await client.query(
      `SELECT profile_photo FROM student WHERE student_id = $1`,
      [studentId]
    );
    if (old.rows[0]?.profile_photo) deleteFile(old.rows[0].profile_photo);

    const { rows } = await client.query(
      `UPDATE student SET profile_photo = NULL WHERE student_id = $1 RETURNING profile_photo`,
      [studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

    res.status(204).end();
  } catch (err) {
    console.error('Error deleting profile photo:', err);
    res.status(500).json({ error: 'Failed to delete profile photo' });
  }
});

// PATCH /api/user/profile/background
router.patch(
  '/user/profile/background',
  uploadBackground.single('backgroundphoto'), // ensure same field name
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const studentId = req.user.id;
    const relPath = `/uploads/backgrounds/${req.file.filename}`;
    try {
      const old = await client.query(
        `SELECT background_photo FROM student WHERE student_id = $1`,
        [studentId]
      );
      if (old.rows[0]?.background_photo) deleteFile(old.rows[0].background_photo);

      const { rows } = await client.query(
        `UPDATE student SET background_photo = $1 WHERE student_id = $2 RETURNING background_photo`,
        [relPath, studentId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Profile not found' });

      const url = `${req.protocol}://${req.get('host')}${rows[0].background_photo}`;
      res.json({ backgroundphoto: url });
    } catch (err) {
      console.error('Error uploading background photo:', err);
      res.status(500).json({ error: 'Failed to update background photo' });
    }
  }
);

module.exports = router;