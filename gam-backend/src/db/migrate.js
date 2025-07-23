import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL || 'postgresql://gam_user:gam_password@localhost:5432/gam_db';

async function runMigrations() {
  let sql;
  
  try {
    console.log('🔄 Connecting to database...');
    sql = postgres(connectionString);
    
    console.log('📋 Reading migration file...');
    const migrationPath = path.join(__dirname, 'migrations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('⚡ Executing migrations...');
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Database migrations completed successfully!');
    console.log('');
    console.log('📊 Database is ready with the following tables:');
    console.log('  - users');
    console.log('  - automations');
    console.log('  - executions');
    console.log('  - automation_shares');
    console.log('  - templates');
    console.log('  - system_logs');
    console.log('');
    
    // Test the connection
    const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log(`🎉 Found ${result.length} tables in database:`);
    result.forEach(table => {
      console.log(`  ✓ ${table.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Possible solutions:');
    console.error('1. Make sure PostgreSQL is running');
    console.error('2. Check database credentials in .env file');
    console.error('3. Run setup-database.sql first to create user and database');
    console.error('4. Verify connection string:', connectionString);
    process.exit(1);
  } finally {
    if (sql) {
      await sql.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migrations
runMigrations();