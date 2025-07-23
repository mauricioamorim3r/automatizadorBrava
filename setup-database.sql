-- GAM Database Setup Script
-- Run this in PostgreSQL to create the database and user

-- Create database
CREATE DATABASE gam_db;

-- Create user
CREATE USER gam_user WITH PASSWORD 'gam_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE gam_db TO gam_user;

-- Connect to gam_db and grant schema privileges
\c gam_db

-- Grant privileges on schema
GRANT ALL PRIVILEGES ON SCHEMA public TO gam_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gam_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gam_user;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gam_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gam_user;