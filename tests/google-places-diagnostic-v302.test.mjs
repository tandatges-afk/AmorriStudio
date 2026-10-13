import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../app/api/places/route.ts', import.meta.url), 'utf8');

test('Places autocomplete requires authenticated Admin before upstream Google call', () => {
 assert.match(source, /authenticatedAdmin\(request\)/);
 assert.match(source, /if \(!admin\) return json\(\{error: 'Chỉ Admin được tìm địa điểm'\}, 403\)/);
});

test('Places key remains server-side and never appears in API response', () => {
 assert.match(source, /process\.env\.GOOGLE_MAPS_API_KEY/);
 assert.doesNotMatch(source, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
 assert.match(source, /'X-Goog-Api-Key': key/);
 assert.match(source, /console\.error\('\[places:autocomplete\]', diagnostic\)/);
});

test('Google error response includes structured classification instead of one generic error', () => {
 for (const code of ['PLACES_MISSING_KEY', 'PLACES_INVALID_KEY', 'PLACES_KEY_RESTRICTION', 'PLACES_API_DISABLED', 'PLACES_BILLING', 'PLACES_QUOTA', 'PLACES_PERMISSION_DENIED', 'PLACES_INVALID_REQUEST']) {
  assert.ok(source.includes(code), `${code} should be handled`);
 }
 assert.match(source, /return json\(\{items: \[\], \.\.\.diagnostic\}, 502\)/);
});
