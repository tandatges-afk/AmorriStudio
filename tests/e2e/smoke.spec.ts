import { test,expect } from '@playwright/test';
test('health and home are reachable',async ({page,request})=>{
 const health=await request.get('/api/health');expect(health.ok()).toBeTruthy();
 await page.goto('/');await expect(page).toHaveTitle(/Amorri Studio/i);
});
test('legacy event and client gallery DOM are served',async ({request})=>{
 const response=await request.get('/studio');expect(response.ok()).toBeTruthy();
 const html=await response.text();expect(html).toContain('id="eventModal"');expect(html).toContain('id="clientGalleryView"');
});
test('anonymous booking creation denied',async ({request})=>{
 const response=await request.post('/api/events',{data:{}});expect([401,403]).toContain(response.status());
});
test('2.4 protects migration diagnostics from anonymous access',async ({request})=>{
 const response=await request.get('/api/migration/diagnostics');
 expect(response.status()).toBe(401);
 const json=await response.json();expect(json.code).toBe('AUTH_TOKEN_MISSING');
});
test('2.4 migration policy and identity endpoints fail safely',async ({request})=>{
 const policy=await request.get('/api/access/policy');expect(policy.status()).toBe(200);
 const config=await policy.json();expect(['compat','read-only']).toContain(config.legacyAdminWrites);
 expect(config.serverEnforcedWrites).toBe(false);
 const me=await request.get('/api/access/me');expect(me.status()).toBe(401);
});

test('2.5 private delivery API refuses missing token and does not return customer fields',async({request,page})=>{
 const response=await request.get('/api/delivery/example-event');
 expect(response.status()).toBe(401);
 const payload=await response.json();expect(payload.code).toBe('DELIVERY_TOKEN_INVALID');
 const grant=await request.get('/api/delivery/grants?eventId=example-event');expect(grant.status()).toBe(401);
 await page.goto('/delivery/example-event');
 await expect(page.getByText('Link bàn giao thiếu mã truy cập.',{exact:false})).toBeVisible();
});

test('2.7 uses Drive only and protects compatibility video endpoint',async({request})=>{
  const health=await request.get('/api/health');
  const version=await health.json();expect(version.streamingApi).toBe('google-drive-only');
  const playback=await request.post('/api/delivery/example-event/playback',{data:{productId:'example-product',mediaId:'0123456789abcdef'}});
  expect(playback.status()).toBe(401);
  const response=await request.post('/api/drive-video',{data:{}});
  expect([400,503]).toContain(response.status());
});


test('2.7 anonymous staff share cannot be read without token',async({request})=>{
 const response=await request.get('/api/staff/shared?staffId=exampleStaff');
 expect(response.status()).toBe(401);
 const body=await response.json();expect(body.code).toBe('STAFF_LINK_INVALID');
 const grants=await request.get('/api/staff/share?staffId=exampleStaff');
 expect(grants.status()).toBe(401);
});

test('2.9 release identity and no Cloudflare return',async({request})=>{
 const response=await request.get('/api/health');
 expect(response.status()).toBe(200);
 const payload=await response.json();
 expect(payload.release).toBe('unified-studio-20261013-r1');
 expect(payload.streamingApi).toBe('google-drive-only');
});
