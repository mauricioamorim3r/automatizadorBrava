import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/models/schema.js',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://gam_user:gam_password@localhost:5432/gam_db',
  },
  verbose: true,
  strict: true,
} satisfies Config;