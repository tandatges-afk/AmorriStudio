import test from 'node:test';
import assert from 'node:assert/strict';
import {detectConceptImage,MAX_CONCEPT_PHOTOS,EVENT_ID} from '../lib/server/concept-policy.mjs';
test('only valid image file signatures accepted, SVG and video rejected',()=>{
 assert.equal(detectConceptImage(Buffer.from('RIFF....WEBP', 'ascii'))?.type,'image/webp');
 assert.equal(detectConceptImage(Buffer.from([255,216,255,0,0,0,0,0,0,0,0,0]))?.type,'image/jpeg');
 assert.equal(detectConceptImage(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))?.type,'image/png');
 assert.equal(detectConceptImage(Buffer.from('<svg onload="1" />')),null);
 assert.equal(detectConceptImage(Buffer.from('notAnImageFile')),null);
});
test('limits media size and validates booking ID',()=>{
 assert.equal(detectConceptImage(Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(2_500_000)])),null);
 assert.equal(MAX_CONCEPT_PHOTOS,6);
 assert.equal(EVENT_ID.test('../../bad'),false);
 assert.equal(EVENT_ID.test('b123456789abcdef'),true);
});
