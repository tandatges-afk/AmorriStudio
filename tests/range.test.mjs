import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRange } from '../lib/server/legacy/range.js';
test('first range defaults to bounded 16 MiB chunk',()=>assert.deepEqual(resolveRange(undefined,50_000_000),{start:0,end:16*1024*1024-1}));
test('seeking accepts exact lower start',()=>assert.deepEqual(resolveRange('bytes=4096-',100000,8192),{start:4096,end:12287}));
test('rejects invalid range',()=>assert.equal(resolveRange('bytes=200-100',1000),null));
test('correct suffix semantics',()=>assert.deepEqual(resolveRange('bytes=-300',1000,800),{start:700,end:999}));
test('rejects out-of-bounds',()=>assert.equal(resolveRange('bytes=1000-',1000),null));
