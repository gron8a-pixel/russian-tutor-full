// scripts/build.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🏗️  Building student frontend...');

// Используем npm install вместо npm ci
execSync('npm install', { cwd: 'client', stdio: 'inherit' });
execSync('npm run build', { cwd: 'client', stdio: 'inherit' });

const distDir = path.resolve(__dirname, '../client/dist');
const publicDir = path.resolve(__dirname, '../server/public');

if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// Копируем через fs.cp (Node.js 16.7+)
try {
  fs.cpSync(distDir, publicDir, { recursive: true });
} catch (err) {
  console.error('❌ Failed to copy files:', err.message);
  process.exit(1);
}

console.log(`✅ Build complete: ${publicDir}`);