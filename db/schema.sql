-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('user', 'manager', 'driver', 'admin')) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Parking Spots Table
CREATE TABLE IF NOT EXISTS parking_spots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    total_slots INTEGER DEFAULT 0,
    available_slots INTEGER DEFAULT 0,
    price_per_hour DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    spot_id INTEGER REFERENCES parking_spots(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    total_amount DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'booked',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data (Optional)
INSERT INTO parking_spots (name, location, total_slots, available_slots, price_per_hour) VALUES
('Phoenix Mall', 'City Center', 200, 150, 50.00),
('Central Plaza', 'Downtown', 100, 10, 40.00),
('City Center Mall', 'Westside', 300, 280, 35.00)
ON CONFLICT DO NOTHING;
