import React, { createContext, useCallback, useContext, useMemo } from 'react';

interface LenisContextValue {
  scrollTo: (target: string | number | HTMLElement, options?: { offset?: number }) => void;
  stop: () => void;
  start: () => void;
}

const LenisContext = createContext<LenisContextValue | null>(null);

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const scrollTo = useCallback(
    (target: string | number | HTMLElement, options?: { offset?: number }) => {
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
      if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior });
        return;
      }
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el instanceof HTMLElement) {
        const top = el.getBoundingClientRect().top + window.scrollY + (options?.offset ?? 0);
        window.scrollTo({ top, behavior });
      }
    },
    []
  );

  const stop = useCallback(() => {
    document.documentElement.style.overflow = 'hidden';
  }, []);

  const start = useCallback(() => {
    document.documentElement.style.overflow = '';
  }, []);

  const value = useMemo(() => ({ scrollTo, stop, start }), [scrollTo, stop, start]);

  return <LenisContext.Provider value={value}>{children}</LenisContext.Provider>;
}

export function useLenis(): LenisContextValue {
  const ctx = useContext(LenisContext);
  if (!ctx) throw new Error('useLenis must be used inside LenisProvider');
  return ctx;
}

export function useHashScroll() {
  const { scrollTo } = useLenis();
  return useCallback(
    (e: React.MouseEvent, href: string) => {
      if (!href.startsWith('#')) return;
      const el = document.querySelector(href);
      if (el instanceof HTMLElement) {
        e.preventDefault();
        scrollTo(el, { offset: 0 });
        history.replaceState(null, '', href);
      }
    },
    [scrollTo]
  );
}
