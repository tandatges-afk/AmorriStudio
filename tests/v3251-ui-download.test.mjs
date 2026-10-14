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
test('Chrome download uses native attachment navigation, not save picker/Blob',()=>{
  const client=source('components/ClientDelivery.tsx');
  const server=source('app/api/delivery/[eventId]/photo-download/route.ts');
  assert.match(client,/form\.method='POST'/);
  assert.match(client,/form\.submit\(\)/);
  assert.match(client,/deliveryToken:token/);
  assert.doesNotMatch(client,/showSaveFilePicker|URL\.createObjectURL/);
  assert.match(server,/application\/x-www-form-urlencoded/);
  assert.match(server,/deliveryEvent\(authRequest,eventId,false,productId\)/);
  assert.match(server,/!item.isVideo/);
  assert.match(server,/Content-Disposition/);
  assert.match(server,/attachment; filename=/);
});
test('money displays one complete amount, retains thousands entry and legacy precision',()=>{
  const input=source('lib/ui/VndInput.tsx');
  assert.match(input,/formatter\.format\(rawNumber\)\+\(focused\?'':' đ'\)/);
  assert.match(input,/unit\*1000/);
  assert.match(input,/safe%1000!==0\?'vnd':'thousands'/);
  assert.doesNotMatch(input,/<span[^>]+>\.000<\/span>/);
});
