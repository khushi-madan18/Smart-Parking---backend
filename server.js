const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


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


app.get('/api/parking', async (req, res) => {
  const mockSpots = [
    { id: 1, name: 'Phoenix Mall', location: 'City Center', status: 'Available', price: 50 },
    { id: 2, name: 'Central Plaza', location: 'Downtown', status: 'Full', price: 40 },
    { id: 3, name: 'City Center Mall', location: 'Westside', status: 'Available', price: 35 },
  ];
  res.json(mockSpots);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
