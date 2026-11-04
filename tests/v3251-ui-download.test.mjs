import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('calendar omits lunar prefix and does not use crosshair cursor',()=>{
  const cal=source('components/CalendarPlanner.tsx'),css=source('components/v30.css');
  assert.doesNotMatch(cal,/>ÂL /);
  assert.match(cal,/onDoubleClick=\{\(\)=>onCreate\(cell.date\)\}/);
  assert.match(css,/\.ops325-create-day\{cursor:default;/);
  assert.doesNotMatch(css,/\.ops325-create-day\{cursor:crosshair;/);
});
test('mobile and desktop use browser-native photo form submissions, not hidden frames/Blob',()=>{
  const client=source('components/ClientDelivery.tsx');
  const server=source('app/api/delivery/[eventId]/photo-download/route.ts');
  assert.match(client,/method="POST"/);
  assert.match(client,/target="_blank"/);
  assert.match(client,/type="submit" className="delivery-photo-download"/);
  assert.match(client,/deliveryToken:token/);
  assert.doesNotMatch(client,/showSaveFilePicker|URL\.createObjectURL|document\.createElement\('iframe'\)|form\.submit\(\)/);
  assert.match(server,/application\/x-www-form-urlencoded/);
  assert.match(server,/deliveryEvent\(authRequest,eventId,false,productId\)/);
  assert.match(server,/!item.isVideo/);
  assert.match(server,/Content-Disposition/);
  assert.match(server,/attachment; filename=/);
});
test('money renders one complete visible amount and preserves non-thousand legacy values',()=>{
 const input=source('lib/ui/VndInput.tsx');
 assert.match(input,/safe%1000!==0/);
 assert.match(input,/Math\.trunc\(safe\/1000\)/);
 assert.match(input,/const next=legacy\?number:number\*1000/);
 assert.match(input,/value=\{display\}/);
 assert.doesNotMatch(input,/<span[^>]+>\.000<\/span>/);
});
