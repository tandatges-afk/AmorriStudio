import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=read('app/amorri-design-system.css');
const layout=read('app/layout.tsx');
const newBooking=read('components/NewBookingDialog.tsx');
const migration=read('components/MigrationReadiness.tsx');

const rgb=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
const luminance=(hex)=>rgb(hex).reduce((sum,val,i)=>sum+val*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};

test('admin imports one unified design layer, not the superseded depth fixes',()=>{
 assert.match(layout,/import '\.\/amorri-design-system\.css'/);
 assert.doesNotMatch(layout,/import '\.\/amorri-depth-contrast\.css'/);
 assert.match(css,/--am-surface:/);
 assert.match(css,/--am-accent:/);
});

test('main surface, muted labels, and champagne CTA have at least 4.5:1 text contrast',()=>{
 assert.ok(contrast('#f2e8ef','#30263b') >= 4.5,'body on card');
 assert.ok(contrast('#d4c3d3','#30263b') >= 4.5,'muted on card');
 assert.ok(contrast('#2c2134','#f4c990') >= 4.5,'CTA ink on champagne');
 assert.ok(contrast('#fff8f4','#3b2f46') >= 4.5,'service label on card');
});

test('calendar outside/hover and payroll row colors override legacy light states',()=>{
 assert.match(css,/\.shell \.ops29-month-day\.outside\s*\{[^}]*opacity:1/);
 assert.match(css,/\.shell \.ops29-month-day\.ops325-create-day:hover/);
 assert.match(css,/\.shell \.ops29-list>button:is\(:hover,:focus-visible\)/);
 assert.match(css,/\.shell \.data-table tbody tr:nth-child\(even\) td/);
 assert.match(css,/\.shell \.data-table tbody td strong\.positive-amount/);
});

test('booking dialog, staff portal and delivery use scoped styles without changing video playback',()=>{
 assert.match(newBooking,/amorri-booking-dialog/);
 assert.match(newBooking,/amorri-booking-form/);
 assert.match(newBooking,/amorri-service-choice/);
 assert.match(css,/\.amorri-staff-portal/);
 assert.match(css,/\.client-delivery \.delivery-hero/);
 assert.doesNotMatch(css,/@keyframes[^}]*video/);
});

test('diagnostics no longer forces white inline cards with dark-mode inherited text',()=>{
 assert.match(migration,/className="amorri-migration"/);
 assert.doesNotMatch(migration,/background:'#fff'/);
 assert.doesNotMatch(migration,/color:'#122133'/);
 assert.match(migration,/background:'var\(--am-surface\)'/);
});

test('GPU-light depth and accessible reduced motion exist together',()=>{
 assert.match(css,/perspective\(950px\)/);
 assert.match(css,/@media \(hover:hover\) and \(pointer:fine\)/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(css,/animation:none!important/);
 assert.match(css,/focus-visible/);
});
