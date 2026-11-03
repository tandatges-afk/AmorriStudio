# Amorri Studio R8.3 — Contrast & Motion

Scope: purely visual. Based on R8.2 + R8.1 RAW fixes. No changes to Drive upload, media streaming, authentication, pay, or booking rules.

## Visual changes

- App theme: higher separation between main background, cards, tables, calendar cells, and inputs.
- Text: body and subdued/placeholder labels use brighter, explicitly scoped values. Dark surfaces use light text; champagne buttons use dark text.
- Statuses: pending amber, confirmed blue, done mint, cancelled rose, each with different fill/border/left marker.
- Buttons: raised shadow on hover, tactile depress on pointer press, visible keyboard focus ring.
- Dashboard and tiles: bounded cursor-driven 3D tilt (requestAnimationFrame already used), highlights, stronger elevation. No React rerenders on pointermove.
- Branding: enhanced gold-mark lighting and bounded outer glow without applying image effects to customer media.
- Electron Tools/Drive Picker: matching contrast, queue surface separation and local logo motion; JavaScript upload flow untouched.

## Accessibility and performance

- Design-token sample contrast cases are verified against WCAG 2.x AA normal-text threshold (4.5:1), in `tests/amorri-r83-contrast-motion.test.mjs`. Not a whole-site WCAG certification.
- Media queries disable decoration on coarse pointers and animation for `prefers-reduced-motion: reduce`.
- No WebGL or third-party animation library. Effects use transforms, opacity and bounded shadows; no changes to 1080p video rendering.
- Functional controls retain visual focus rings. A 3D effect is not used as the only status indicator.

## Validation

Run in a clean repository:

```powershell
npm ci
npm run typecheck
npm test
npm run test:unit
node scripts/check-static.mjs
npm run build
npm --prefix desktop ci
npm --prefix desktop run typecheck
npm --prefix desktop run test:desktop
```

Manual QA: check dashboard/card hover, click press, tab transitions, payroll dark/even/hover rows, calendar day and status legibility, new-booking input focus, brand avatar, and desktop tools/picker under normal, 200% zoom, mobile/touch, reduced-motion settings. The generated EXE/DMG require a fresh build after release.
