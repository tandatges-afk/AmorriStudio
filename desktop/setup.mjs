import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = path.dirname(fileURLToPath(import.meta.url));
const filename = path.join(folder, 'package.json');
if (!fs.existsSync(filename)) {
  console.error('Không tìm thấy desktop/package.json. Trước tiên chạy npm init -y và npm install trong thư mục desktop.');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(filename, 'utf8'));
const required = ['electron', 'electron-builder', 'typescript', '@types/node'];
const missing = required.filter((key) => !pkg.devDependencies?.[key] && !pkg.dependencies?.[key]);
if (missing.length) {
  console.error(`Còn thiếu các packages: ${missing.join(', ')}`);
  process.exit(1);
}
// Preserve dependencies and package-lock that the user has already installed.
pkg.name = 'amorri-studio-desktop';
pkg.productName = 'Amorri Studio';
if (!pkg.version || ['1.0.0', '1.1.0'].includes(pkg.version)) pkg.version = '1.2.0';
pkg.description = 'Amorri Studio Desktop — secure Windows shell for Vercel web app';
pkg.main = 'dist/main.js';
pkg.private = true;
pkg.license = 'UNLICENSED';
pkg.scripts = {
  ...pkg.scripts,
  'build:main': 'tsc -p tsconfig.json',
  typecheck: 'tsc --noEmit -p tsconfig.json',
  dev: 'npm run build:main && electron .',
  start: 'npm run build:main && electron .',
  'dist:win': 'npm run build:main && electron-builder --config electron-builder.yml --win nsis --x64',
  'test:raw': 'npm run build:main && node --test tests/raw-match.test.mjs',
  'test:desktop': 'npm run build:main && node --test tests/raw-match.test.mjs tests/desktop-commands.test.mjs',
};
fs.writeFileSync(filename, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('Đã cấu hình desktop/package.json mà không thay đổi dependencies.');
console.log('Tiếp theo: sửa desktop.config.json, npm run typecheck, npm run dev.');
