import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const motion = read('app/amorri-motion-system.css');
const interaction = read('components/AmorriMicroInteractions.tsx');

test('motion stylesheet loads after unified palette; client pointer handler is mounted', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.indexOf("'./amorri-motion-system.css'") > layout.indexOf("'./amorri-design-system.css'"));
  assert.match(layout, /<AmorriMicroInteractions\s*\/>/);
});
test('dashboard transitions really remount on tab/month switch and animate final KPI values', () => {
  const source = read('components/Dashboard.tsx');
  const count = read('components/AnimatedCount.tsx');
  assert.match(source, /key=\{`\$\{tab\}:\$\{tab === 'system' \? systemSection : month\}`\}/);
  assert.match(source, /<AnimatedCount value=\{c\.value\}\s*\/>/);
  assert.match(count, /requestAnimationFrame/);
  assert.match(count, /aria-hidden="true"/);
  assert.match(count, /className="sr-only"/);
});
test('3D card lighting is pointer-responsive but neither touches React state nor video', () => {
  assert.match(interaction, /requestAnimationFrame/);
  assert.match(interaction, /--am-rotate-x/);
  assert.match(interaction, /--am-pointer-y/);
  assert.match(interaction, /document\.addEventListener\('pointermove'/);
  assert.doesNotMatch(interaction, /fetch\(|setInterval\(|document\.querySelectorAll\(/);
  assert.match(motion, /rotateX\(var\(--am-rotate-x\)\) rotateY\(var\(--am-rotate-y\)\)/);
});
test('buttons respond to press with pointer ripple and keyboard focus remains visible', () => {
  assert.match(interaction, /document\.createElement\('span'\)/);
  assert.match(interaction, /am-press-wave/);
  assert.match(interaction, /button\.disabled/);
  assert.match(motion, /@keyframes am-press/);
  assert.match(motion, /:focus-visible/);
});
test('booking steps and calendar period/view navigation visibly transition', () => {
  assert.match(read('components/NewBookingDialog.tsx'), /key=\{step\}/);
  assert.match(read('components/CalendarPlanner.tsx'), /key=\{data\.month\}/);
  assert.match(read('components/CalendarPlanner.tsx'), /key=\{week\}/);
  assert.match(motion, /am-sheet-in/);
  assert.match(motion, /am-card-in/);
  assert.match(motion, /am-dialog-step/);
});
test('reduced-motion and touch opt-outs prevent tilt and animation', () => {
  assert.match(interaction, /prefers-reduced-motion: reduce/);
  assert.match(interaction, /pointer: fine/);
  assert.match(motion, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(motion, /@media \(hover:none\), \(pointer:coarse\)/);
  assert.match(read('components/AnimatedCount.tsx'), /prefers-reduced-motion: reduce/);
});

test('public delivery and staff portal have real action feedback without media effects', () => {
  assert.match(interaction, /client-delivery \.delivery-photo-select/);
  assert.match(interaction, /amorri-staff-portal button/);
  assert.match(motion, /\.client-delivery \.delivery-photo:hover/);
  assert.match(motion, /\.amorri-staff-portal>div>header/);
  assert.doesNotMatch(motion, /\bvideo\s*\{/);
});
