'use client';

import {useEffect, useState} from 'react';

/** Visual count-up only. Assistive technology reads the final, stable value. */
export function AnimatedCount({value}: {value: number}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    let id = 0;
    const start = performance.now();
    const duration = 700;
    const target = Math.max(0, value);
    const initial = display;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(initial + (target - initial) * eased));
      if (progress < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <strong><span aria-hidden="true">{display.toString().padStart(2, '0')}</span><span className="sr-only">{value}</span></strong>;
}
