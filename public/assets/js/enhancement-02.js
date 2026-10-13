
(() => {
  const nav = document.querySelector('.app > .sidebar');
  if (!nav) return;
  const mobile = window.matchMedia('(max-width:768px)');
  const interactive = el => !!el?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
  let offset = 0, lastY = window.scrollY || 0, pending = false, direction = 0, accumulated = 0;
  function height() { return Math.max(56, nav.getBoundingClientRect().height + 12); }
  function blocked() { return interactive(document.activeElement) || !!document.querySelector('.modal-overlay.active, .modal-backdrop.active, dialog[open]'); }
  function setOffset(next, instant = false) {
    offset = Math.max(0, Math.min(height(), next));
    nav.style.setProperty('--amorri-mobile-nav-offset', `${Math.round(offset)}px`);
    // Translate credit and navigation together without animating layout/bottom.
    document.body.style.setProperty('--amorri-credit-shift', `${Math.round(offset)}px`);
    nav.classList.toggle('amorri-nav-at-rest', !instant && (offset < 1 || offset >= height()-1));
  }
  function update() {
    pending = false;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const dy = y - lastY;
    lastY = y;
    if (!mobile.matches || y < 24 || blocked()) { setOffset(0); return; }
    if (Math.abs(dy) < 1.3 || Math.abs(dy) > 220) return;
    const nextDir = Math.sign(dy);
    if (direction !== nextDir) { direction = nextDir; accumulated = 0; }
    accumulated += Math.abs(dy);
    // Ignore tiny rubber-band movements; otherwise follow finger/scroll smoothly.
    if (accumulated < 9) return;
    setOffset(offset + dy * 0.96, true);
  }
  window.addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }, { passive:true });
  window.addEventListener('resize', () => { lastY=window.scrollY || 0;setOffset(0); }, { passive:true });
  document.addEventListener('focusin', e => { if (interactive(e.target)) setOffset(0); });
  nav.addEventListener('pointerdown', () => setOffset(0), {passive:true});
  setOffset(0);
})();

//# sourceURL=assets/js/enhancement-02.js
