'use client';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Public Firebase project identifiers are not secrets, but MUST be configured
// explicitly to avoid accidental writes against a hard-coded production project.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export function browserAuth() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Thiếu cấu hình NEXT_PUBLIC_FIREBASE_*; kiểm tra .env.local hoặc Firebase App Hosting Environment');
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}
