// src/middleware/upload.js
const multer = require('multer');
const path  = require('path');
const { v4: uuidv4 } = require('uuid');

// Disk storage for a folder
const storage = folder => multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'public', 'uploads', folder));
  },
  filename: (req, file, cb) => {
    cb(null, uuidv4() + path.extname(file.originalname));
  }
});

const uploadProfile    = multer({ storage: storage('profiles') });
const uploadBackground = multer({ storage: storage('backgrounds') });

module.exports = { uploadProfile, uploadBackground };