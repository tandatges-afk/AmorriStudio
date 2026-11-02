# Amorri Studio — Unified Design System 4.0

Last updated: 2026-11-02. Read `../CLAUDE.md` and `../AGENTS.md` before editing.

## Why this exists

Previous `amorri-depth-contrast.css` tried to invert light components by generic selectors. Some Tailwind light backgrounds, inline styles and hover states escaped those overrides, causing pale text on white backgrounds in the calendar, payroll and migration diagnostics.

The active stylesheet is **`app/amorri-design-system.css`**, imported last in `app/layout.tsx`. The superseded `app/amorri-depth-contrast.css` was retired; **do not re-import it**. Older `globals.css`, `amorri-premium.css`, `amorri-premium-v2.css`, `components/v29.css` and `components/v30.css` contain structural styling and legacy values, but the unified layer is the authoritative color system.

## Palette and surfaces

| Semantic use | Color |
| --- | --- |
| Workspace background | `#18131f` |
| Sidebar / dark base | `#211a2b` |
| Primary panel | `#30263b` |
| Raised panel | `#392d44` |
| Body text | `#f2e8ef` |
| Heading text | `#fff8f4` |
| Muted text | `#d4c3d3` |
| Accent champagne | `#f4c990` |
| Text on champagne | `#2c2134` |
| Positive | `#a0f1c9` |
| Warning | `#ffdda2` |
| Error | `#ffc0cc` |

Inside `.shell`, prefer **`var(--am-*)`** tokens; define new semantic tokens only when necessary. For JSX text, use inherited colors when possible, avoiding arbitrary Tailwind `bg-white text-slate-*` combinations. Calendar disabled/outside cells must never fade using `opacity` on the whole cell. Keep error/warning/confirmation colors paired with labels/borders so meaning is not conveyed by color alone.

The customer delivery page intentionally remains warm-paper/light for photography, while the staff portal uses paper surfaces against a plum header. Their palette is coordinated; the public video element, R2 URLs, photo thumbnail styling and media bytes are not changed by this redesign.

## Effects and accessibility

- CSS-only dimensional hero, card elevation, gentle hover tilt and dialog entrance. No new rendering packages, WebGL, scroll listeners or GPU-heavy parallax.
- Effects apply only for precise hover devices. Inputs, tables, calendars and media players do not tilt during use.
- A `prefers-reduced-motion: reduce` override removes animation and transition. Visible `:focus-visible` rings are mandatory.
- Tested token combinations meet 4.5:1 text contrast for body-on-panel, muted-on-panel, service card and accent button. Always verify any newly introduced token pairs.

## Verification checklist

Run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:unit`, `node scripts/check-static.mjs`, and `npm run build` before pushing to `main`.

In Chromium, review: desktop and mobile dashboard; calendar month hover/outside days/list row focus; payroll even/odd rows; diagnostics cards; service picker and full booking form; staff portal; client image/video delivery. Verify date input contrast and button focus state on Windows/Chrome, and check `prefers-reduced-motion`.

The static color and CSS browser mock checks run without production APIs. They **do not** prove that real production Firebase, Google Drive, R2 media, or Electron UX works.
