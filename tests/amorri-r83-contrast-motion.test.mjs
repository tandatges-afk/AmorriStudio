import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const web = readFileSync('app/amorri-contrast-motion-r83.css','utf8');
const desktop = readFileSync('desktop/assets/amorri-contrast-motion-r83.css','utf8');
const layout = readFileSync('app/layout.tsx','utf8');
const motion = readFileSync('components/AmorriMicroInteractions.tsx','utf8');
const tools = readFileSync('desktop/assets/tools.html','utf8');
const picker = readFileSync('desktop/assets/picker.html','utf8');

const rgb = value => [1,3,5].map(offset => parseInt(value.slice(offset,offset+2),16)/255);
const luminance = value => rgb(value).map(c => c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
  .reduce((sum,c,i) => sum + c*[.2126,.7152,.0722][i],0);
const ratio = (a,b) => {const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05)};

const pairs = [
  ['dashboard body','#f6eaf1','#282034'],
  ['muted over raised card','#e5cfe0','#34283f'],
  ['secondary over elevated card','#d8c2d5','#43324c'],
  ['input','#fffaf6','#1b1526'],
  ['input placeholder','#d8c4d4','#1b1526'],
  ['pending','#ffe4ae','#483016'],
  ['confirmed','#d6eaff','#193e69'],
  ['done','#b6fadd','#154838'],
  ['cancelled','#ffd2df','#532037'],
  ['primary button','#261a30','#f4c990'],
];

test('R8.3 critical text combinations meet 4.5:1 AA for normal text',()=>{
  for(const [name,text,bg] of pairs){assert.ok(ratio(text,bg)>=4.5,`${name}: ${ratio(text,bg).toFixed(2)} < 4.5`)}
});
test('R8.3 is loaded after the old R8.2 theme',()=>{
  assert.ok(layout.indexOf("import './amorri-contrast-motion-r83.css';") > layout.indexOf("import './amorri-brand-elevation.css';"));
});
test('R8.3 targets exact four status variants and critical tables, calendars, inputs',()=>{
  for(const state of ['pending','confirmed','done','cancelled']) assert.ok(web.includes(`.ops29-event.s-${state}`));
  for(const marker of ['.ops29-month-day','.data-table tbody tr:nth-child(even)','::placeholder','.amorri-booking-dialog',':focus-visible']) assert.ok(web.includes(marker));
});
test('R8.3 cards and buttons have real perspective and pressed feedback',()=>{
  assert.match(web,/perspective\(980px\)/);
  assert.match(web,/\.am-tilt-active/);
  assert.match(web,/\.primary-button:active:not\(:disabled\)/);
  assert.match(web,/\.ops29-action/);
  assert.match(motion,/\.shell \.staff-card, \.shell \.delivery-card/);
});
test('Electron tool and picker use R8.3 visual layer without changing their upload scripts',()=>{
  for(const html of [tools,picker]) assert.ok(html.includes('amorri-contrast-motion-r83.css'));
  assert.match(tools,/premium-queue\.js/);
  assert.match(picker,/picker\.js/);
  assert.match(desktop,/\.amorri-brand-mark:hover/);
});
test('reduced motion, touch and forced-colors remain supported',()=>{
  assert.match(web,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(web,/@media \(hover:none\),\(pointer:coarse\)/);
  assert.match(web,/@media\(forced-colors:active\)/);
  assert.match(desktop,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(desktop,/@media\(forced-colors:active\)/);
});
test('R8.3 never modifies video pixels or creates a WebGL/canvas loop',()=>{
  assert.doesNotMatch(web,/(?:^|\n)\s*(?:video|canvas|\.delivery-video)\s*\{/);
  assert.doesNotMatch(web+desktop,/WebGL|setInterval\(|backdrop-filter:blur\(\d{2,}px\)/);
});
