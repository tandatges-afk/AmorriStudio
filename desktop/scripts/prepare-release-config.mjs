// R10.4: release builds use a dedicated Google OAuth Desktop client, never Firebase Admin JSON.
// This value goes inside a distributed desktop app; it is NOT a server-side secret.
import fs from 'node:fs';

function validConfig(raw) {
  let config;
  try { config = JSON.parse(raw); }
  catch { throw new Error('Desktop runtime config must be valid JSON'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Desktop runtime config must be an object');
  let parsed;
  try { parsed = new URL(String(config.webUrl || '')); }
  catch { throw new Error('Invalid desktop webUrl'); }
  if (parsed.href !== 'https://amorri.io.vn/' || parsed.username || parsed.password)
    throw new Error('Desktop release must point only to https://amorri.io.vn/ (not Vercel or localhost)');
  const googleOAuthClientId = String(config.googleOAuthClientId || '').trim();
  const googleOAuthClientSecret = String(config.googleOAuthClientSecret || '').trim();
  if (!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(googleOAuthClientId))
    throw new Error('Missing or invalid Google OAuth Desktop client ID');
  if (!googleOAuthClientSecret || googleOAuthClientSecret.startsWith('REPLACE'))
    throw new Error('Missing Google OAuth Desktop client secret');
  const driveReaderEmail = String(config.driveReaderEmail || '').trim();
  if (driveReaderEmail && !/^[^@\s]+@[^@\s]+$/.test(driveReaderEmail))
    throw new Error('Invalid Drive reader email');
  return {webUrl: parsed.href, googleOAuthClientId, googleOAuthClientSecret, driveReaderEmail};
}

if (process.argv.includes('--verify')) {
  const config = validConfig(fs.readFileSync('desktop.config.json','utf8'));
  console.log('Desktop release config OK: VPS domain and OAuth Desktop client (credential values hidden)');
} else {
  const raw=process.env.AMORRI_CONFIG_JSON || '';
  if (!raw) throw new Error('Missing AMORRI_DESKTOP_CONFIG_JSON GitHub Actions secret');
  const config = validConfig(raw);
  fs.writeFileSync('desktop.config.json', JSON.stringify(config, null, 2)+'\n', {mode:0o600});
  console.log('Desktop release configuration created (credential values hidden)');
}
