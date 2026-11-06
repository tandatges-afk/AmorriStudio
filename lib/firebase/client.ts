'use client';
import {getApps,initializeApp,getApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {localBrowserAuth} from '@/lib/selfhost/auth-client';
const config={
 apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
 authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
 databaseURL:process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
 projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
 appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
/** Keep legacy Vercel sessions alive while VPS is being prepared.
 * Local auth activates ONLY in a build with explicit NEXT_PUBLIC flag.
 */
export function browserAuth(){
 if(process.env.NEXT_PUBLIC_AMORRI_AUTH_BACKEND==='local')return localBrowserAuth();
 if(!config.apiKey||!config.authDomain||!config.projectId||!config.appId)throw new Error('Thiếu cấu hình NEXT_PUBLIC_FIREBASE_*');
 const app=getApps().length?getApp():initializeApp(config);
 return getAuth(app);
}
