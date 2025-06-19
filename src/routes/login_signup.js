// src/routes/login_signup.js

const express               = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt                = require('bcrypt');
const jwt                   = require('jsonwebtoken');
const pool                  = require('../db');
const admin = require("../firebase/firebaseAdmin");
// Initialize Firebase Admin only once
if (!admin.apps.length) {
  const serviceAccount = require("../../firebase/serviceAccountKey.json"); // make sure this file exists

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}


const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: Missing JWT_SECRET in environment');
  process.exit(1);
}
const TOKEN_EXPIRY = '1h';

// Helper to format validation errors
const formatErrors = errs =>
  errs.map(e => ({ field: e.param, message: e.msg }));

// POST /api/auth/signup
router.post(
  '/signup',
  [
    body('fullName')
      .trim()
      .notEmpty().withMessage('Full name is required')
      .isLength({ max: 100 }).withMessage('Full name too long'),
    body('email')
      .isEmail().withMessage('Valid email required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 }).withMessage('Password ≥ 8 chars')
      .matches(/\d/).withMessage('Must contain a number')
      .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: formatErrors(errors.array()) });
    }

    const { fullName, email, password } = req.body;
    try {
      // Check for existing email
      const dup = await pool.query(
        'SELECT 1 FROM student WHERE email = $1',
        [email]
      );
      if (dup.rowCount > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash and insert new user
      const hashed = await bcrypt.hash(password, 10);
      const ins = await pool.query(
        `INSERT INTO student (full_name, email, password)
         VALUES ($1, $2, $3)
         RETURNING student_id, full_name, email`,
        [fullName, email, hashed]
      );

      const user = ins.rows[0];
      return res.status(201).json({
        id: user.student_id,
        fullName: user.full_name,
        email: user.email
      });

    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);
// POST /api/auth/login
router.post(
  '/login',
  [
    body('email')
      .isEmail().withMessage('Valid email required')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: formatErrors(errors.array()) });
    }

    const { email, password } = req.body;
    try {
      // Fetch user by email
      const userRes = await pool.query(
        `SELECT student_id, full_name, email, password
         FROM student
         WHERE email = $1`,
        [email]
      );
      if (userRes.rowCount === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = userRes.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.student_id, email: user.email },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return res.json({
        token,
        expiresIn: 3600,
        user: {
          id: user.student_id,
          fullName: user.full_name,
          email: user.email
        }
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);
// POST /api/auth/google
router.post("/google", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "Missing ID token" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, name, email, picture } = decodedToken;

    let user;
    const existingUser = await pool.query(
      "SELECT * FROM student WHERE firebase_uid = $1",
      [uid]
    );

    if (existingUser.rows.length === 0) {
      // check by email in case user exists without firebase UID
      const emailUser = await pool.query(
        "SELECT * FROM student WHERE email = $1",
        [email]
      );

      if (emailUser.rows.length === 0) {
        // new user - insert
        const insertUser = await pool.query(
          `INSERT INTO student 
           (full_name, email, password, background_photo, profile_photo, gender, birthdate, about_me, firebase_uid)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [name || "", email, null, null, picture || null, null, null, null, uid]
        );
        user = insertUser.rows[0];
      } else {
        // user exists by email, update firebase_uid
        await pool.query(
          "UPDATE student SET firebase_uid = $1 WHERE student_id = $2",
          [uid, emailUser.rows[0].student_id]
        );
        user = emailUser.rows[0];
      }
    } else {
      user = existingUser.rows[0];
    }

    // Issue JWT with student_id
    const appToken = jwt.sign({ userId: user.student_id }, process.env.JWT_SECRET,{ expiresIn: "7d" });
    res.status(200).json({
      success: true,
      token: appToken,
      user: {
        id: user.student_id,
        full_name: user.full_name,
        email: user.email,
        profile_photo: user.profile_photo,
      },
    });
  } catch (err) {
    console.error("Google Login Error:", err);
    res.status(401).json({ error: "Invalid ID token" });
  }
});

module.exports = router;
