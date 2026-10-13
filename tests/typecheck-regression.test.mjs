import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('EventEditor uses narrowed immutable eventId for PATCH, DELETE and products', () => {
  const editor = read('components/EventEditor.tsx');
  assert.match(editor,/if\(!id\)return null;\s*\/\/[^\n]*\n const eventId: string = id;/);
  assert.ok((editor.match(/encodeURIComponent\(eventId\)/g)||[]).length >= 4);
  assert.equal((editor.match(/encodeURIComponent\(id\)/g)||[]).length, 1); // GET in effect
});

test('Booking ref infers SDK type without unavailable firebase-admin import', () => {
  const storage = read('lib/server/event-storage.ts');
  assert.doesNotMatch(storage,/import type \{ DatabaseReference \} from ['"]firebase-admin\/database['"]/);
  assert.match(storage,/type DatabaseReference = ReturnType<ReturnType<typeof adminDatabase>\['ref'\]>;/);
});
