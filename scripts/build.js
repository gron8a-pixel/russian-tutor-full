// russian-tutor-full/scripts/build.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🏗️  Building frontend for student...');

// Build client
execSync('npm ci', { cwd: 'client', stdio: 'inherit' });
execSync('npm run build', { cwd: 'client', stdio: 'inherit' });

// Paths
const distDir = path.resolve(__dirname, '../client/dist');
const publicDir = path.resolve(__dirname, '../server/public');

// Clear public
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// Copy
fs.cpSync(distDir, publicDir, { recursive: true });

console.log(`✅ Copied ${distDir} → ${publicDir}`);