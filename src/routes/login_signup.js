// src/routes/login_signup.js

const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const admin = require("../firebase/firebaseAdmin");
const rateLimit = require("express-rate-limit");
const emailService = require('../services/email_service');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: Missing JWT_SECRET in environment');
  process.exit(1);
}

// Updated token expiry to 30 days instead of 1 hour
const TOKEN_EXPIRY = '30d';

// Rate limiting for authentication requests
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 OTP attempts per IP per window
  message: { error: 'Too many OTP requests. Please try again later.' }
});

// Rate limiting for password reset requests
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset attempts per IP per hour
  message: { error: 'Too many password reset requests. Please try again later.' }
});

// Helper to format validation errors
const formatErrors = errs =>
  errs.map(e => ({ field: e.param, message: e.msg }));

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Enhanced password validation
const passwordValidation = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character')
];

// Enhanced email validation
const emailValidation = [
  body('email')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email address is too long')
];

// POST /api/auth/signup
router.post(
  '/signup',
  authLimiter,
  [
    body('fullName')
      .trim()
      .notEmpty().withMessage('Full name is required')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
      .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces'),
    ...emailValidation,
    ...passwordValidation
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        errors: formatErrors(errors.array()) 
      });
    }

    const { fullName, email, password } = req.body;
    
    try {
      // Check for existing email
      const existingUser = await pool.query(
        'SELECT 1 FROM student WHERE email = $1',
        [email]
      );
      
      if (existingUser.rowCount > 0) {
        return res.status(409).json({ 
          error: 'An account with this email already exists' 
        });
      }

      // Hash password with higher cost for better security
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Insert new user
      const newUser = await pool.query(
        `INSERT INTO student (full_name, email, password, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING student_id, full_name, email, created_at`,
        [fullName, email, hashedPassword]
      );

      const user = newUser.rows[0];
      
      // Log successful signup
      console.log(`New user registered: ${email}`);
      
      return res.status(201).json({
        message: 'Account created successfully',
        user: {
          id: user.student_id,
          fullName: user.full_name,
          email: user.email,
          createdAt: user.created_at
        }
      });

    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ 
        error: 'Failed to create account. Please try again.' 
      });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  authLimiter,
  [
    ...emailValidation,
    body('password')
      .notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        errors: formatErrors(errors.array()) 
      });
    }

    const { email, password } = req.body;
    
    try {
      // Fetch user by email
      const userResult = await pool.query(
        `SELECT student_id, full_name, email, password, created_at, last_login
         FROM student
         WHERE email = $1`,
        [email]
      );
      
      if (userResult.rowCount === 0) {
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }

      const user = userResult.rows[0];
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          error: 'Invalid email or password' 
        });
      }

      // Update last login
      await pool.query(
        'UPDATE student SET last_login = NOW() WHERE student_id = $1',
        [user.student_id]
      );

      // Generate JWT with 30 days expiry
      const token = jwt.sign(
        { 
          userId: user.student_id, 
          email: user.email,
          iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      // Log successful login
      console.log(`User logged in: ${email}`);

      return res.json({
        message: 'Login successful',
        token,
        expiresIn: 30 * 24 * 3600, // 30 days in seconds
        user: {
          id: user.student_id,
          fullName: user.full_name,
          email: user.email,
          lastLogin: user.last_login
        }
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ 
        error: 'Login failed. Please try again.' 
      });
    }
  }
);

// POST /api/auth/google
router.post("/google", authLimiter, async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ 
      error: "Google ID token is required" 
    });
  }

  try {
    // Verify the ID token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, name, email, picture, email_verified } = decodedToken;

    if (!email_verified) {
      return res.status(400).json({ 
        error: "Please verify your Google account email before signing in" 
      });
    }

    let user;
    
    // Check if user exists with Firebase UID
    const existingUser = await pool.query(
      "SELECT * FROM student WHERE firebase_uid = $1",
      [uid]
    );

    if (existingUser.rows.length === 0) {
      // Check by email in case user exists without Firebase UID
      const emailUser = await pool.query(
        "SELECT * FROM student WHERE email = $1",
        [email]
      );

      if (emailUser.rows.length === 0) {
        // New user - insert
        const insertUser = await pool.query(
          `INSERT INTO student 
           (full_name, email, password, profile_photo, firebase_uid, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [name || "", email, null, picture || null, uid]
        );
        user = insertUser.rows[0];
        console.log(`New Google user registered: ${email}`);
      } else {
        // User exists by email, update Firebase UID
        const updateUser = await pool.query(
          `UPDATE student 
           SET firebase_uid = $1, last_login = NOW(), profile_photo = COALESCE(profile_photo, $2)
           WHERE student_id = $3
           RETURNING *`,
          [uid, picture, emailUser.rows[0].student_id]
        );
        user = updateUser.rows[0];
        console.log(`Existing user linked with Google: ${email}`);
      }
    } else {
      // Update last login and profile photo if needed
      const updateUser = await pool.query(
        `UPDATE student 
         SET last_login = NOW(), profile_photo = COALESCE(profile_photo, $1)
         WHERE firebase_uid = $2
         RETURNING *`,
        [picture, uid]
      );
      user = updateUser.rows[0];
      console.log(`Google user logged in: ${email}`);
    }

    // Generate JWT with 30 days expiry
    const appToken = jwt.sign(
      { 
        userId: user.student_id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      }, 
      JWT_SECRET, 
      { expiresIn: TOKEN_EXPIRY }
    );

    res.status(200).json({
      success: true,
      message: 'Google sign-in successful',
      token: appToken,
      expiresIn: 30 * 24 * 3600, // 30 days in seconds
      user: {
        id: user.student_id,
        fullName: user.full_name,
        email: user.email,
        profilePhoto: user.profile_photo,
        lastLogin: user.last_login
      },
    });
    
  } catch (err) {
    console.error("Google Login Error:", err);
    
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: "Google sign-in session expired. Please try again." });
    } else if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: "Google sign-in was revoked. Please try again." });
    }
    
    res.status(401).json({ 
      error: "Google sign-in failed. Please try again." 
    });
  }
});

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, [
  ...emailValidation
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Invalid email address',
      errors: formatErrors(errors.array()) 
    });
  }

  const { email } = req.body;
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT student_id, full_name FROM student WHERE email = $1', 
      [email]
    );
    
    if (userResult.rowCount === 0) {
      return res.status(404).json({ 
        error: 'No account found with this email address' 
      });
    }

    const user = userResult.rows[0];

    // Store OTP in database (upsert)
    await pool.query(
      `INSERT INTO otp_codes (email, otp_code, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (email) 
       DO UPDATE SET otp_code = $2, expires_at = $3, created_at = NOW()`,
      [email, otp, expiresAt]
    );

    // Send OTP via email
    const emailResult = await emailService.sendOTP(email, otp, user.full_name);
    
    if (!emailResult.success) {
      console.error('Failed to send OTP email:', emailResult.error);
      return res.status(500).json({ 
        error: 'Failed to send OTP. Please try again.' 
      });
    }

    console.log(`OTP sent to: ${email}`);
    
    res.json({ 
      message: 'OTP sent successfully. Please check your email.',
      expiresIn: 10 * 60 // 10 minutes in seconds
    });
    
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ 
      error: 'Failed to send OTP. Please try again.' 
    });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', authLimiter, [
  ...emailValidation,
  body('otp')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits')
    .isNumeric().withMessage('OTP must contain only numbers')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Invalid input',
      errors: formatErrors(errors.array()) 
    });
  }

  const { email, otp } = req.body;

  try {
    // Verify OTP
    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND expires_at > NOW()',
      [email, otp]
    );

    if (otpResult.rowCount === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired OTP. Please request a new one.' 
      });
    }

    // Delete used OTP
    await pool.query('DELETE FROM otp_codes WHERE email = $1', [email]);

    // Get user data and update last login
    const userResult = await pool.query(
      `UPDATE student 
       SET last_login = NOW() 
       WHERE email = $1 
       RETURNING student_id, full_name, email, last_login`,
      [email]
    );

    const user = userResult.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { 
        userId: user.student_id, 
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    console.log(`OTP login successful: ${email}`);

    res.json({
      message: 'Login successful',
      token,
      expiresIn: 30 * 24 * 3600, // 30 days in seconds
      user: {
        id: user.student_id,
        fullName: user.full_name,
        email: user.email,
        lastLogin: user.last_login
      }
    });
    
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ 
      error: 'OTP verification failed. Please try again.' 
    });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, [
  ...emailValidation
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Invalid email address',
      errors: formatErrors(errors.array()) 
    });
  }

  const { email } = req.body;

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT student_id, full_name FROM student WHERE email = $1', 
      [email]
    );
    
    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with this email exists, a password reset link has been sent.';
    
    if (userResult.rowCount === 0) {
      return res.json({ message: successMessage });
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token (upsert)
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, email, reset_token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (email)
       DO UPDATE SET reset_token = $3, expires_at = $4, created_at = NOW()`,
      [user.student_id, email, resetToken, expiresAt]
    );

    // Send reset email
    const emailResult = await emailService.sendPasswordReset(email, resetToken, user.full_name);
    
    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
      // Still return success message for security
    } else {
      console.log(`Password reset email sent to: ${email}`);
    }

    res.json({ 
      message: successMessage,
      expiresIn: 60 * 60 // 1 hour in seconds
    });
    
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ 
      error: 'Failed to process password reset request. Please try again.' 
    });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, [
  body('token')
    .notEmpty().withMessage('Reset token is required')
    .isLength({ min: 32, max: 128 }).withMessage('Invalid reset token format'),
  ...passwordValidation
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Invalid input',
      errors: formatErrors(errors.array()) 
    });
  }

  const { token, password } = req.body;

  try {
    // Verify reset token
    const tokenResult = await pool.query(
      'SELECT user_id, email FROM password_reset_tokens WHERE reset_token = $1 AND expires_at > NOW()',
      [token]
    );

    if (tokenResult.rowCount === 0) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset token. Please request a new password reset.' 
      });
    }

    const { user_id, email } = tokenResult.rows[0];

    // Hash new password with higher cost
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Update password
    await pool.query(
      'UPDATE student SET password = $1 WHERE student_id = $2',
      [hashedPassword, user_id]
    );

    // Delete used reset token
    await pool.query('DELETE FROM password_reset_tokens WHERE reset_token = $1', [token]);

    console.log(`Password reset successful for: ${email}`);

    res.json({ 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
    
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ 
      error: 'Password reset failed. Please try again.' 
    });
  }
});

// GET /api/auth/verify-token (bonus endpoint to verify if token is valid)
router.get('/verify-token', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists
    const userResult = await pool.query(
      'SELECT student_id, full_name, email FROM student WHERE student_id = $1',
      [payload.userId]
    );
    
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    
    const user = userResult.rows[0];
    
    res.json({
      valid: true,
      user: {
        id: user.student_id,
        fullName: user.full_name,
        email: user.email
      }
    });
    
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});





// Add this route to serve the password reset page
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invalid Reset Link</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .error { color: #e74c3c; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="error">Invalid Reset Link</h2>
          <p>This password reset link is invalid or missing. Please request a new password reset.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Serve the password reset form
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reset Password - Guidera</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); max-width: 400px; width: 90%; }
        h2 { color: #333; margin-bottom: 10px; text-align: center; }
        .subtitle { color: #666; margin-bottom: 30px; text-align: center; }
        .form-group { margin-bottom: 20px; }
        label { display: block; color: #333; margin-bottom: 5px; font-weight: 500; }
        input[type="password"] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px; transition: border-color 0.3s; }
        input[type="password"]:focus { outline: none; border-color: #667eea; }
        .btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s; }
        .btn:hover { transform: translateY(-2px); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .error { color: #e74c3c; margin-top: 10px; font-size: 14px; }
        .success { color: #27ae60; margin-top: 10px; font-size: 14px; }
        .requirements { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 10px; }
        .requirements h4 { color: #333; margin-bottom: 10px; font-size: 14px; }
        .requirements ul { list-style: none; }
        .requirements li { color: #666; font-size: 13px; margin-bottom: 5px; }
        .requirements li.valid { color: #27ae60; }
        .requirements li.invalid { color: #e74c3c; }
        .requirements li::before { content: "• "; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔐 Reset Password</h2>
        <p class="subtitle">Create a new secure password</p>
        
        <form id="resetForm">
          <div class="form-group">
            <label for="password">New Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input type="password" id="confirmPassword" name="confirmPassword" required>
          </div>
          
          <div class="requirements">
            <h4>Password Requirements:</h4>
            <ul id="requirements">
              <li id="length">At least 8 characters</li>
              <li id="uppercase">One uppercase letter</li>
              <li id="lowercase">One lowercase letter</li>
              <li id="number">One number</li>
              <li id="special">One special character</li>
            </ul>
          </div>
          
          <button type="submit" class="btn" id="submitBtn">Reset Password</button>
          <div id="message"></div>
        </form>
      </div>

      <script>
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        const form = document.getElementById('resetForm');
        const message = document.getElementById('message');
        const submitBtn = document.getElementById('submitBtn');

        function validatePassword(pass) {
          const requirements = {
            length: pass.length >= 8,
            uppercase: /[A-Z]/.test(pass),
            lowercase: /[a-z]/.test(pass),
            number: /\\d/.test(pass),
            special: /[!@#$%^&*(),.?":{}|<>]/.test(pass)
          };

          Object.keys(requirements).forEach(req => {
            const element = document.getElementById(req);
            element.className = requirements[req] ? 'valid' : 'invalid';
          });

          return Object.values(requirements).every(Boolean);
        }

        password.addEventListener('input', () => {
          validatePassword(password.value);
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          if (!validatePassword(password.value)) {
            message.innerHTML = '<div class="error">Please ensure your password meets all requirements</div>';
            return;
          }

          if (password.value !== confirmPassword.value) {
            message.innerHTML = '<div class="error">Passwords do not match</div>';
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'Resetting...';

          try {
            const response = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: '${token}',
                password: password.value
              })
            });

            const data = await response.json();

            if (response.ok) {
              message.innerHTML = '<div class="success">Password reset successful! You can now close this page and log in to the Guidera app with your new password.</div>';
              form.style.display = 'none';
            } else {
              message.innerHTML = '<div class="error">' + (data.error || 'Password reset failed') + '</div>';
            }
          } catch (error) {
            message.innerHTML = '<div class="error">Network error. Please try again.</div>';
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
          }
        });
      </script>
    </body>
    </html>
  `);
});


module.exports = router;