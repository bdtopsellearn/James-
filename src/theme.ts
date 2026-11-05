import { useSyncExternalStore } from 'react';

/**
 * Ultra-light theme store.
 *
 * Why this exists: the theme used to live in `useState` inside App.tsx, so every
 * toggle re-rendered the ENTIRE app tree (thousands of DOM nodes) and repainted
 * every glass/backdrop-filter surface — which is what made day↔dark switching
 * feel laggy. Here the theme lives in a tiny external store, only the few
 * components that actually display the toggle subscribe, and the DOM class flips
 * in a single frame.
 *
 * Animated switch: on Chromium/Edge (and any browser that supports the View
 * Transitions API) the switch plays a soft circular reveal that grows from the
 * toggle button the user just pressed, so day↔dark feels like a deliberate
 * animation. Browsers without the API keep the old instant, jank-free flip.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pn_theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private mode / storage disabled */
  }
  return 'dark';
}

let current: Theme = readInitial();
const listeners = new Set<() => void>();

function applyToDom(t: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.dataset.theme = t;
  root.style.colorScheme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0a0e1a' : '#f8fafc');
}

// Apply immediately at module-eval time (before React mounts) to avoid a flash
// of the wrong theme on first paint.
applyToDom(current);

export function getTheme(): Theme {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ── Track the last pointer position so the reveal can start from the toggle ──
// The pointerdown that triggers a toggle always fires *before* the button's
// click handler, so by the time setTheme() runs these coordinates point at the
// button the user just pressed. Keyboard toggles fall back to the viewport
// centre (handled below).
let pointerX = 0;
let pointerY = 0;
let hasPointer = false;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      hasPointer = true;
    },
    { capture: true, passive: true }
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function setTheme(next: Theme) {
  if (next === current) return;
  const root = typeof document !== 'undefined' ? document.documentElement : null;

  const commit = () => {
    current = next;
    applyToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  };

  const doc: any = typeof document !== 'undefined' ? document : null;
  const canAnimate =
    !!doc && typeof doc.startViewTransition === 'function' && !prefersReducedMotion();

  if (canAnimate) {
    // Origin of the circular reveal = the last pointer position (the toggle
    // button the user just pressed), falling back to the viewport centre.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const x = hasPointer ? pointerX : vw / 2;
    const y = hasPointer ? pointerY : vh / 2;
    const dx = Math.max(x, vw - x);
    const dy = Math.max(y, vh - y);
    const radius = Math.ceil(Math.hypot(dx, dy)) + 2;
    root?.style.setProperty('--pn-theme-x', `${x}px`);
    root?.style.setProperty('--pn-theme-y', `${y}px`);
    root?.style.setProperty('--pn-theme-r', `${radius}px`);

    // Lock per-element transitions so ONLY the snapshot reveal animates — this
    // is what keeps the switch silky instead of a repaint storm.
    root?.classList.add('pn-theme-switching');

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      root?.classList.remove('pn-theme-switching');
    };

    try {
      const transition = doc.startViewTransition(() => {
        commit();
      });
      if (transition && transition.finished && typeof transition.finished.then === 'function') {
        transition.finished.then(release).catch(release);
      } else {
        release();
      }
      // Safety net: never leave the transition lock stuck on.
      setTimeout(release, 1400);
    } catch {
      // If the View Transition API throws for any reason, fall back to instant.
      release();
      commit();
    }
    return;
  }

  // ── Fallback: instant, jank-free switch (transitions locked for one frame) ──
  root?.classList.add('pn-theme-switching');
  commit();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root?.classList.remove('pn-theme-switching'));
    });
  } else {
    root?.classList.remove('pn-theme-switching');
  }
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/** React hook — only the component that calls this re-renders on toggle. */
export function useTheme(): readonly [Theme, () => void] {
  const t = useSyncExternalStore(subscribe, getTheme, getTheme);
  return [t, toggleTheme] as const;
}
