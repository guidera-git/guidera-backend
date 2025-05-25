// src/index.js

// 1) Load .env from project root (one path import only)
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const express        = require('express');
const cors           = require('cors');
const loginSignupRt  = require('./routes/login_signup');
const authMiddleware = require('./middleware/auth');
const profileRt      = require('./routes/profile');
const degreeRt       = require('./routes/degree');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

// Public routes
app.use('/api/auth', loginSignupRt);
app.use(
  '/uploads',
  express.static(
    path.join(__dirname, 'public', 'uploads'),
    { maxAge: '7d', etag: true, lastModified: true }
  )
);

// Protected routes
app.use('/api', authMiddleware);
app.use('/api', profileRt);
app.use('/api', degreeRt);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
