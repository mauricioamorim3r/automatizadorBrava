-- Initialize database with extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create initial database structure
\echo 'GAM Database initialized successfully'