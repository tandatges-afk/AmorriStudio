import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePhotoFeedback,publicPhotoFeedback,upsertPhotoFeedback} from '../lib/domain/photo-comment-policy.mjs';
import fs from 'node:fs';

test('one non-empty feedback, max length; no scripts embedded as HTML by browser',()=>{
 assert.equal(parsePhotoFeedback({text:'  chỉnh sáng lên '}).text,'chỉnh sáng lên');
 assert.equal(parsePhotoFeedback({text:' ' }),null);
 assert.equal(parsePhotoFeedback({text:'a'.repeat(1201)}),null);
 assert.equal(parsePhotoFeedback({text:'ok',name:'A'.repeat(66)}).name.length,60);
});
test('edit keeps original createdAt; delete is represented by removing same path',()=>{
 const original=upsertPhotoFeedback(null,{name:'Khách',text:'Sửa màu'},100,'001.jpg');
 const edited=upsertPhotoFeedback(original,{name:'Khách',text:'Đẹp hơn'},200,'001.jpg');
 assert.equal(edited.createdAt,100);assert.equal(edited.updatedAt,200);
 assert.equal(publicPhotoFeedback(edited).text,'Đẹp hơn');
});
test('routes implement PUT/DELETE, not POST that could append duplicate feedback',()=>{
 const s=fs.readFileSync('app/api/delivery/[eventId]/photo-comments/route.ts','utf8');
 assert.match(s,/export async function PUT/);assert.match(s,/export async function DELETE/);
 assert.doesNotMatch(s,/\.push\(/);
 assert.match(s,/deliveryEvent\(request,eventId,true,productId\)/);
 assert.match(s,/f\.id===mediaId/);
 assert.match(s,/ownGrantId\(request\)/);
});
test('client uses one album GET and places form underneath each photo, admin has viewer',()=>{
 const c=fs.readFileSync('components/ClientDelivery.tsx','utf8');
 const a=fs.readFileSync('components/DeliveryReviewManager.tsx','utf8');
 assert.match(c,/usePhotoFeedback\(eventId,productId,token\)/);
 assert.match(c,/<PhotoCommentCard/);assert.match(c,/onDelete=\{\(\)=>photoFeedback\.remove\(i\.id\)\}/);
 assert.match(a,/<PhotoFeedbackAdmin/);
});
