// src/index.js

// Load .env from project root
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const express = require('express');
const cors = require('cors');
const loginSignupRt = require('./routes/login_signup');
const authMiddleware = require('./middleware/auth');
const profileRt = require('./routes/profile');
const degreeRt = require('./routes/degree');
const chatbotRt = require('./routes/chatbot');
const search = require('./routes/universities');
const cart = require('./routes/cart');

const app = express();

// Middleware
app.use(cors());
// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

// Public uploads route
app.use(
  '/uploads',
  express.static(
    path.join(__dirname, 'public', 'uploads'),
    { maxAge: '7d', etag: true, lastModified: true }
  )
);

// Body-parser
const bodyParser = require('body-parser');
app.use(bodyParser.json());

// Public auth routes
app.use('/api/auth', loginSignupRt);

// Protected routes
app.use('/api', authMiddleware);
app.use('/api', profileRt);
app.use('/api', degreeRt);
app.use('/api', chatbotRt);
app.use('/api', search);


app.use('/api', cart);
// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
