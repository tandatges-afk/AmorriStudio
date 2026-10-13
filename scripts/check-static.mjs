import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const read = f => readFileSync(resolve(root,f),'utf8');
function check(ok, label) {if(!ok)throw new Error(label);console.log('PASS',label);}
const packageJson=JSON.parse(read('package.json'));
const nextCfg=read('next.config.ts');
const apphosting=read('apphosting.yaml');
const legacy=read('public/legacy/index.html');
check(packageJson.scripts.build==='next build','Next.js native build command');
check(apphosting.includes('runConfig:') && apphosting.includes('FIREBASE_SERVICE_ACCOUNT_JSON') && apphosting.includes('DRIVE_VIDEO_SIGNING_SECRET'),'Firebase App Hosting Next.js & protected secrets config');
check(!existsSync(resolve(root,'vercel.json')),'No Vercel-only functions config');
check(nextCfg.includes("source: '/studio', destination: '/legacy/index.html'"),'compatibility rewrite');
check(legacy.includes('<base href="/">'),'asset root for /studio');
check(legacy.includes('id="clientGalleryView"'),'original delivery markup preserved');
check(legacy.includes('id="eventModal"'),'original event editor preserved');
check(legacy.includes('id="payrollModal"'),'original payroll modal preserved');
check(legacy.includes('assets/js/enhancement-06.js'),'legacy video controller preserved');
check(legacy.includes('assets/vnext/media-stability.js'),'VNext media stabilizer preserved');
for(const f of ['public/assets/js/main.js','public/assets/css/legacy.css','public/assets/css/stability.css','pages/api/drive-video.js','pages/api/get-drive-images.js'])check(existsSync(resolve(root,f)),`File present: ${f}`);
check(read('app/page.tsx').includes('params.client_gallery || params.staff'),'old root query links redirect');
check(read('app/api/dashboard/route.ts').includes('authenticatedAdmin(request)'),'new dashboard checks admin server-side');
check(!read('app/api/dashboard/route.ts').includes('NEXT_PUBLIC_FIREBASE_ADMIN'),'admin secrets not from NEXT_PUBLIC');

check(existsSync(resolve(root,'postcss.config.mjs')),'Tailwind PostCSS enabled');
check(read('app/globals.css').includes("@import 'tailwindcss'"),'Tailwind v4 enabled');
check(existsSync(resolve(root,'app/api/events/route.ts')),'Native Next.js create-booking API');
check(existsSync(resolve(root,'components/NewBookingDialog.tsx')),'Native React booking form');
