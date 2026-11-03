'use client';

import {useEffect} from 'react';

// Keep pointer motion outside React render cycles; no timers, services or canvas.
// The listeners are delegated so dynamically mounted dashboard tabs also work.
const tiltSelector = '.shell .metric, .shell .welcome-band, .shell .ops29-analytics-kpis article';
const buttonSelector = '.shell .primary-button, .shell .secondary-button, .shell .nav-item, .shell .welcome-cta, .shell .ops29-action, .shell .ops29-view-switch button, .shell .ops30-system-tabs button, .shell .month-navigator, .shell .top-icon, .amorri-booking-dialog button, .client-delivery .delivery-primary, .client-delivery .delivery-photo-select, .client-delivery .delivery-photo-download, .client-delivery .delivery-form button, .amorri-staff-portal button';

export function AmorriMicroInteractions() {
  useEffect(() => {
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let activeCard: HTMLElement | null = null;

    const allowMotion = () => pointer.matches && !reduceMotion.matches;
    const findCard = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(tiltSelector) : null;
    const resetCard = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!activeCard) return;
      activeCard.classList.remove('am-tilt-active');
      activeCard.style.removeProperty('--am-rotate-x');
      activeCard.style.removeProperty('--am-rotate-y');
      activeCard.style.removeProperty('--am-pointer-x');
      activeCard.style.removeProperty('--am-pointer-y');
      activeCard = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!allowMotion() || event.pointerType !== 'mouse') return;
      const card = findCard(event.target);
      if (card !== activeCard) resetCard();
      if (!card) return;
      activeCard = card;
      // Coalesce mouse movements: one style update per paint, no React re-render.
      if (frame) cancelAnimationFrame(frame);
      const x = event.clientX;
      const y = event.clientY;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!card.isConnected) { resetCard(); return; }
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const px = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        const py = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
        card.style.setProperty('--am-rotate-x', `${((0.5 - py) * 5).toFixed(2)}deg`);
        card.style.setProperty('--am-rotate-y', `${((px - 0.5) * 5).toFixed(2)}deg`);
        card.style.setProperty('--am-pointer-x', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--am-pointer-y', `${(py * 100).toFixed(1)}%`);
        card.classList.add('am-tilt-active');
      });
    };

    const onPointerOut = (event: PointerEvent) => {
      if (activeCard && event.target instanceof Node && activeCard.contains(event.target) &&
          !(event.relatedTarget instanceof Node && activeCard.contains(event.relatedTarget))) resetCard();
    };

    const onPress = (event: PointerEvent) => {
      if (!allowMotion() || event.pointerType !== 'mouse' || event.button !== 0) return;
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(buttonSelector) : null;
      if (!button || button.disabled) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'am-press-wave';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      ripple.addEventListener('animationend', () => ripple.remove(), {once: true});
      button.appendChild(ripple);
    };

    const onMotionPreference = () => { if (!allowMotion()) resetCard(); };
    document.addEventListener('pointermove', onPointerMove, {passive: true});
    document.addEventListener('pointerout', onPointerOut, {passive: true});
    document.addEventListener('pointerdown', onPress, {passive: true});
    pointer.addEventListener('change', onMotionPreference);
    reduceMotion.addEventListener('change', onMotionPreference);
    return () => {
      resetCard();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPress);
      pointer.removeEventListener('change', onMotionPreference);
      reduceMotion.removeEventListener('change', onMotionPreference);
    };
  }, []);
  return null;
}
