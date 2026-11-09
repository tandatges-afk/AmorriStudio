import {test,expect} from '@playwright/test';

// Safe, anonymous smoke checks. Do not put production secrets or real customer IDs in CI.
test('health identifies the actual batch release without exposing secrets',async({request})=>{
 const res=await request.get('/api/health');expect(res.status()).toBe(200);
 expect(res.headers()['cache-control']).toContain('no-store');
 const health=await res.json();
 expect(health.ok).toBe(true);
 expect(health.currentRelease).toBe('amorri-r10.5-batch-20261109');
 expect(health.database).toMatch(/^(postgresql-vps|firebase-legacy)$/);
 expect(health.storage).toMatch(/^(s3|r2)$/);
 expect(health.streamingApi).toBe(health.storage==='s3'?'vps-s3-1080p-signed-url':'r2-only-1080p-signed-url-no-vercel-video');
 expect(health.commit===null||/^[a-f0-9]{40}$/.test(health.commit)).toBe(true);
 for(const key of ['password','secret','token','credential','apiKey'])expect(health).not.toHaveProperty(key);
});

test('homepage renders on desktop and mobile',async({page})=>{
 await page.goto('/');await expect(page).toHaveTitle(/Amorri Studio/i);
});

test('bookmarked /studio URL redirects without leaking data',async({request})=>{
 const resp=await request.get('/studio',{maxRedirects:0});
 expect([307,308]).toContain(resp.status());
 expect(resp.headers()['location']).toBe('/');
});

test('anonymous browser cannot create bookings',async({request})=>{
 const response=await request.post('/api/events',{data:{}});
 expect([401,403,503]).toContain(response.status());
});

test('guest delivery endpoints reject missing capability token',async({request})=>{
 const response=await request.get('/api/delivery/example-event');
 expect(response.status()).toBe(401);
 const body=await response.json();expect(body.code).toBe('DELIVERY_TOKEN_INVALID');
});

test('unauthenticated access never returns private system diagnostics',async({request})=>{
 const response=await request.get('/api/system/diagnostics');
 expect([401,503]).toContain(response.status());
});

test('local login rejects requests without the canonical Origin',async({request})=>{
 const response=await request.post('/api/auth/local/login',{data:{identifier:'example',password:'dummy-password'}});
 expect([403,404]).toContain(response.status());
});
