// src/db.js

// Load environment variables from .env in project root
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT, 10),
  // you can add max, idleTimeoutMillis, etc. here if desired
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL via pool');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = pool;
