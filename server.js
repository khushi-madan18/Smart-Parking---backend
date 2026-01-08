const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: '*' })); // Allow all origins explicitly
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});


let pool;

if (process.env.DATABASE_URL) {

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  console.log('Using Supabase PostgreSQL');
} else {

  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'smart_parking',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
  });
  console.log('Using local PostgreSQL');
}

pool.connect()
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection error:', err));


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Smart Parking API is running' });
});


// Initialize Database
// Initialize Database
const initDb = async () => {
  try {
    // Create Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        role VARCHAR(50)
      );
    `);

    // Ensure columns exist (Migration fix)
    try {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)');

      // Fix ID type mismatch (Integer vs BigInt)
      await pool.query('ALTER TABLE users ALTER COLUMN id TYPE BIGINT');
      await pool.query('ALTER TABLE requests ALTER COLUMN id TYPE BIGINT');

      // Fix Legacy Constraints (Supabase/Previous Schema)
      try {
        await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
      } catch (e) { /* Ignore if column doesn't exist */ }

      console.log('Verified user schema columns and types');
    } catch (e) {
      console.log('Schema verification note:', e.message);
    }

    // Create Requests Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id BIGINT PRIMARY KEY,
        user_id VARCHAR(255),
        user_name VARCHAR(255),
        user_phone VARCHAR(50),
        vehicle JSONB,
        location VARCHAR(255),
        status VARCHAR(50),
        timestamp TIMESTAMPTZ,
        valet_id VARCHAR(255),
        valet_name VARCHAR(255),
        parked_timestamp TIMESTAMPTZ,
        exit_timestamp TIMESTAMPTZ,
        spot_id VARCHAR(50)
      );
    `);
    console.log('Database initialized: users and requests tables ready');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};
initDb();

// API Endpoints
// Auth
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  const id = Date.now(); // Simple ID gen
  try {
    const query = `INSERT INTO users (id, name, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const result = await pool.query(query, [id, name, email, password, role || 'user']);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'User already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET all requests
app.get('/api/requests', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM requests ORDER BY timestamp DESC');
    // Map snake_case DB columns back to camelCase for frontend compatibility
    const formatted = result.rows.map(row => ({
      id: parseInt(row.id), // BIGINT comes as string often, ensure number if frontend expects it, or keep string
      userId: row.user_id,
      userName: row.user_name,
      userPhone: row.user_phone,
      vehicle: row.vehicle,
      location: row.location,
      status: row.status,
      timestamp: row.timestamp,
      valetId: row.valet_id,
      valetName: row.valet_name,
      parkedTimestamp: row.parked_timestamp,
      exitTimestamp: row.exit_timestamp,
      spotId: row.spot_id
    }));
    res.json(formatted);
  } catch (err) {
    console.error('Error fetching requests:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST new request
app.post('/api/requests', async (req, res) => {
  const r = req.body;

  // Basic validation or ID generation if needed, but client sends ID currently
  // If ID is not present, generate one. Ideally DB does this but we want to honor client ID if possible or generate if null
  const id = r.id || Date.now();

  try {
    const query = `
      INSERT INTO requests (id, user_id, user_name, user_phone, vehicle, location, status, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [
      id,
      r.userId || '999',
      r.userName || 'Unknown',
      r.userPhone || '',
      r.vehicle || {},
      r.location || '',
      r.status || 'requested',
      r.timestamp || new Date().toISOString()
    ];

    const result = await pool.query(query, values);
    const row = result.rows[0];

    res.json({
      id: parseInt(row.id),
      userId: row.user_id,
      userName: row.user_name,
      userPhone: row.user_phone,
      vehicle: row.vehicle,
      location: row.location,
      status: row.status,
      timestamp: row.timestamp
    });
  } catch (err) {
    console.error('Error creating request:', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// PATCH request status/details
app.patch('/api/requests/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Dynamically build UPDATE query
  // Map frontend camelCase fields to DB snake_case columns
  const fieldMap = {
    status: 'status',
    valetId: 'valet_id',
    valetName: 'valet_name',
    parkedTimestamp: 'parked_timestamp',
    exitTimestamp: 'exit_timestamp',
    spotId: 'spot_id'
  };

  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key]) {
      setClauses.push(`${fieldMap[key]} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(id); // ID is the last param
  const query = `UPDATE requests SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;

  try {
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const row = result.rows[0];
    res.json({
      id: parseInt(row.id),
      userId: row.user_id,
      userName: row.user_name,
      userPhone: row.user_phone,
      vehicle: row.vehicle,
      location: row.location,
      status: row.status,
      timestamp: row.timestamp,
      valetId: row.valet_id,
      valetName: row.valet_name,
      parkedTimestamp: row.parked_timestamp,
      exitTimestamp: row.exit_timestamp,
      spotId: row.spot_id
    });
  } catch (err) {
    console.error('Error updating request:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

app.get('/api/parking', async (req, res) => {
  const mockSpots = [
    { id: 1, name: 'Phoenix Mall', location: 'City Center', status: 'Available', price: 50 },
    { id: 2, name: 'Central Plaza', location: 'Downtown', status: 'Full', price: 40 },
    { id: 3, name: 'City Center Mall', location: 'Westside', status: 'Available', price: 35 },
  ];
  res.json(mockSpots);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
