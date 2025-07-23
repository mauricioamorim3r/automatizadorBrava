import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔧 GAM Backend - Installation Script');
console.log('=====================================\n');

// Clean installation
console.log('1. Cleaning previous installation...');
try {
  if (fs.existsSync('node_modules')) {
    console.log('   - Removing node_modules...');
    execSync('rmdir /s /q node_modules', { stdio: 'inherit' });
  }
  if (fs.existsSync('package-lock.json')) {
    console.log('   - Removing package-lock.json...');
    fs.unlinkSync('package-lock.json');
  }
  console.log('   ✅ Cleanup complete\n');
} catch (error) {
  console.log('   ⚠️ Cleanup had some issues, continuing...\n');
}

// Install dependencies
console.log('2. Installing dependencies...');
try {
  execSync('npm install --no-optional --prefer-offline', { 
    stdio: 'inherit',
    timeout: 300000 // 5 minutes timeout
  });
  console.log('   ✅ Dependencies installed successfully\n');
} catch (error) {
  console.log('   ❌ Some dependencies failed, trying alternative approach...');
  
  // Try installing without problematic packages first
  try {
    console.log('   - Installing core dependencies...');
    execSync('npm install express cors helmet morgan dotenv jsonwebtoken bcryptjs zod drizzle-orm postgres redis uuid winston fs-extra --no-optional', { stdio: 'inherit' });
    
    console.log('   - Installing additional dependencies...');
    execSync('npm install rate-limiter-flexible @azure/msal-node @microsoft/microsoft-graph-client archiver multer node-cron --no-optional', { stdio: 'inherit' });
    
    console.log('   - Installing puppeteer (this may take a while)...');
    execSync('npm install puppeteer@22.0.0 --no-optional', { stdio: 'inherit' });
    
    console.log('   ✅ Alternative installation successful\n');
  } catch (altError) {
    console.log('   ❌ Alternative installation also failed');
    console.log('   📝 You may need to install dependencies manually');
    console.log('   💡 Try: npm install --legacy-peer-deps\n');
  }
}

// Create necessary directories
console.log('3. Creating necessary directories...');
const dirs = ['logs', 'temp', 'screenshots', 'uploads'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   ✅ Created ${dir}/ directory`);
  } else {
    console.log(`   ℹ️ ${dir}/ directory already exists`);
  }
});
console.log('');

// Create .env file if it doesn't exist
console.log('4. Setting up environment...');
if (!fs.existsSync('.env')) {
  fs.copyFileSync('.env.example', '.env');
  console.log('   ✅ Created .env file from .env.example');
  console.log('   📝 Please update .env with your database credentials');
} else {
  console.log('   ℹ️ .env file already exists');
}
console.log('');

// Final status
console.log('🎉 Installation Complete!');
console.log('========================\n');
console.log('Next steps:');
console.log('1. Update your .env file with database credentials');
console.log('2. Make sure PostgreSQL and Redis are running');
console.log('3. Run: npm run dev');
console.log('');
console.log('If you encounter issues:');
console.log('- Check logs/ directory for error details');
console.log('- Ensure you have PostgreSQL and Redis running');
console.log('- Try: npm install --legacy-peer-deps');
console.log('');