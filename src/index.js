// src/index.js
require('dotenv').config();
const express        = require('express');
const cors           = require('cors');

const loginSignupRt  = require('./routes/login_signup');
const authMiddleware = require('./middleware/auth');
const profileRt      = require('./routes/profile');
// … other routers …

const app = express();
app.use(cors());
app.use(express.json());

// 1) Public routes
app.use('/api/auth', loginSignupRt);

// 2) Protect everything below with auth middleware
//    This sets `req.user = { id: … }`
app.use('/api', authMiddleware);

// 3) Now mount profile (and any other protected) routes
//    All routes in profileRt see req.user populated
app.use('/api', profileRt);
// e.g. GET  /api/user/profile
//      PATCH/DELETE /api/user/profile/…

// … mount other protected routers here …

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
