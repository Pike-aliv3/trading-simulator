const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

// the server uses the pooled connection string
const connectionString = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
if (!connectionString) {
    console.error('No database connection string found. Set DATABASE_URL_POOLED (or DATABASE_URL) in the .env file at the repo root.');
    process.exit(1);
}

const pool = new Pool({ connectionString });

// without this, a dropped idle connection would crash the server
pool.on('error', (err) => console.error('Unexpected error on idle database connection:', err.message));

module.exports = { pool };
