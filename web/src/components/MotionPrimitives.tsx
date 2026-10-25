import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, Transition, useReducedMotion } from 'framer-motion';
import { useLenis } from './LenisProvider';
import { scaleLogoSize, ZeroPulseMark } from './Icons';
import { MicroVizConfig } from '../data/content';

export const EASE_REVEAL: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_CHAR: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_PRELOADER_EXIT: [number, number, number, number] = [0.76, 0, 0.24, 1];

export const SPRING_DEFAULT: Transition = { duration: 0.5, ease: EASE_REVEAL };
export const SPRING_NAV_IN: Transition = { duration: 0.5, ease: EASE_REVEAL };
export const SPRING_TILT: Transition = { duration: 0.55, ease: EASE_REVEAL };
export const SPRING_SLOW: Transition = { duration: 0.6, ease: EASE_REVEAL };
export const SPRING_LIFT: Transition = { duration: 0.45, ease: EASE_REVEAL };
export const SPRING_MENU: Transition = { type: 'spring', bounce: 0.15, duration: 0.38 };
export const SPRING_ACCORDION: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 1 };

export const BLUR_CONFIG = {
  character: { y: 24, duration: 0.5, stagger: 0.035 },
  word: { duration: 0.5, stagger: 0.035 },
  element: { duration: 0.5 },
};

export const PRELOADER_TIMING = {
  brandDelay: 0.12,
  holdOne: 480,
  holdTwo: 620,
  exit: 0.5,
};

export const NAV_DELAY = {
  intro: 1.25,
  instant: 0.05,
};

let hasPlayedIntro = false;
export function getHasPlayedIntro() {
  return hasPlayedIntro;
}
export function markIntroPlayed() {
  hasPlayedIntro = true;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Resilient viewport detector that combines getBoundingClientRect() on mount/scroll
 * with IntersectionObserver so elements never get stuck hidden in StrictMode or custom browsers.
 */
export function useElementInView<T extends Element>(
  ref: React.RefObject<T | null>,
  rootMargin = '600px 0px 600px 0px'
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setInView(true);
      return;
    }

    const checkPosition = () => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 600 && rect.bottom > -600) {
        setInView(true);
        return true;
      }
      return false;
    };

    if (checkPosition()) return;

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              setInView(true);
              io?.disconnect();
              break;
            }
          }
        },
        { rootMargin, threshold: 0 }
      );
      io.observe(el);
    }

    const onScrollOrResize = () => {
      if (checkPosition()) {
        window.removeEventListener('scroll', onScrollOrResize);
        window.removeEventListener('resize', onScrollOrResize);
        io?.disconnect();
      }
    };

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [ref, rootMargin]);

  return inView;
}

export function Preloader({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const { stop, start } = useLenis();
  const [phase, setPhase] = useState(1);
  const doneRef = useRef(false);
  const word = 'ZEROPULSE';

  const finish = useCallback(() => {
    if (!doneRef.current) {
      doneRef.current = true;
      markIntroPlayed();
      start();
      onDone();
    }
  }, [onDone, start]);

  useEffect(() => {
    stop();
    return () => start();
  }, [stop, start]);

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }
    const t1 = window.setTimeout(() => setPhase(2), PRELOADER_TIMING.holdOne);
    const t2 = window.setTimeout(
      () => setPhase(3),
      PRELOADER_TIMING.holdOne + PRELOADER_TIMING.holdTwo
    );
    const tFallback = window.setTimeout(
      () => finish(),
      PRELOADER_TIMING.holdOne + PRELOADER_TIMING.holdTwo + PRELOADER_TIMING.exit * 1000 + 150
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(tFallback);
    };
  }, [reduced, finish]);

  const chars = Array.from(word);
  const charMotion = (idx: number) => ({
    initial: reduced
      ? false
      : {
          opacity: 0,
          y: BLUR_CONFIG.character.y,
        },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: BLUR_CONFIG.character.duration,
      ease: EASE_CHAR,
      delay: PRELOADER_TIMING.brandDelay + idx * BLUR_CONFIG.character.stagger,
    },
  });

  return (
    <motion.div
      className="yon-preloader"
      data-phase={phase}
      role="presentation"
      initial={false}
      animate={{ y: phase === 3 ? '-100%' : 0 }}
      transition={{ duration: PRELOADER_TIMING.exit, ease: EASE_PRELOADER_EXIT }}
      onAnimationComplete={() => {
        if (phase === 3) finish();
      }}
    >
      <motion.div
        className="yon-preloader__brand"
        aria-label={word}
        initial={reduced ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: PRELOADER_TIMING.brandDelay,
          duration: 0.5,
          ease: EASE_PRELOADER_EXIT,
        }}
      >
        <motion.span className="yon-preloader__mark" aria-hidden="true" {...charMotion(0)}>
          <ZeroPulseMark size={scaleLogoSize(38)} color="#ff1e38" />
        </motion.span>
        <span className="yon-preloader__word" aria-hidden="true">
          {chars.map((ch, idx) => (
            <motion.span
              key={`${ch}-${idx}`}
              style={idx >= 4 ? { color: '#ff1e38' } : undefined}
              {...charMotion(idx + 1)}
            >
              {ch}
            </motion.span>
          ))}
        </span>
      </motion.div>
      <motion.svg
        viewBox="0 0 260 36"
        className="yon-preloader__ecg"
        aria-hidden="true"
      >
        <motion.path
          d="M0 18 H90 L104 6 L118 30 L132 4 L146 28 L158 18 H260"
          fill="none"
          stroke="#ff1e38"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: (PRELOADER_TIMING.holdOne + PRELOADER_TIMING.holdTwo) / 1000,
            ease: EASE_REVEAL,
          }}
        />
      </motion.svg>
    </motion.div>
  );
}

type RevealKind = 'rise' | 'left' | 'right' | 'tilt' | 'fade' | 'lift';

const REVEAL_HIDDEN_TRANSFORM: Record<RevealKind, string> = {
  rise: 'translate3d(0, 24px, 0)',
  left: 'translate3d(-24px, 0, 0)',
  right: 'translate3d(24px, 0, 0)',
  tilt: 'translate3d(0, 20px, 0) scale(0.97)',
  fade: 'translate3d(0, 0, 0)',
  lift: 'translate3d(0, 16px, 0)',
};

export function Reveal({
  children,
  kind = 'rise',
  delay = 0,
  className,
  id,
  style,
}: {
  children: React.ReactNode;
  kind?: RevealKind;
  delay?: number;
  amount?: number;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  transition?: Transition;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useElementInView(ref);

  if (reduced) {
    return (
      <div id={id} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      id={id}
      className={className}
      style={{
        ...style,
        opacity: inView ? 1 : 0.15,
        transform: inView ? 'translate3d(0, 0, 0) scale(1)' : REVEAL_HIDDEN_TRANSFORM[kind],
        transitionProperty: 'opacity, transform',
        transitionDuration: '0.38s',
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        transitionDelay: delay ? `${delay}s` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function formatNumber(val: string): string {
  return val.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function AnimatedCounter({
  end,
  start = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  end: number;
  start?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useElementInView(ref);
  const reduced = useReducedMotion();
  const [val, setVal] = useState(reduced ? end : start);

  useEffect(() => {
    if (!inView || reduced) return;
    const ctrl = animate(start, end, {
      duration: 0.85,
      ease: EASE_REVEAL,
      onUpdate: (v) => setVal(v),
    });
    return () => ctrl.stop();
  }, [inView, reduced, start, end]);

  const fmt = (n: number) => formatNumber(n.toFixed(decimals));

  return (
    <span ref={ref} className={['mvn-count', className].filter(Boolean).join(' ')}>
      <span className="mvn-count__sizer" aria-hidden="true">
        {prefix}
        {fmt(end)}
        {suffix}
      </span>
      <span className="mvn-count__live">
        {prefix}
        {fmt(val)}
        {suffix}
      </span>
    </span>
  );
}

const RING_R = 45.5;
const RING_CIRC = 2 * Math.PI * RING_R;

export function CircularRing({
  value,
  from = 0,
  suffix = '%',
  size,
}: {
  value: number;
  from?: number;
  suffix?: string;
  size?: 'sm' | 'lg';
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useElementInView(ref);
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(reduced ? value : from);

  const targetOffset = RING_CIRC - (value / 100) * RING_CIRC;
  const startOffset = RING_CIRC - (from / 100) * RING_CIRC;

  useEffect(() => {
    if (!inView || reduced) return;
    const ctrl = animate(from, value, {
      duration: 1.0,
      ease: EASE_REVEAL,
      onUpdate: (v) => setCurrent(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [inView, reduced, value, from]);

  return (
    <div ref={ref} className="mvn-ring" data-size={size}>
      <svg className="mvn-ring__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          stroke="rgba(255, 30, 56, 0.14)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          stroke="#ff1e38"
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={inView || reduced ? targetOffset : startOffset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <span className="mvn-ring__value">
        {current}
        {suffix}
      </span>
    </div>
  );
}

export function ScaleFill({
  value,
  delay = 0,
  axis = 'x',
  on,
  className = 'mvn-viz__fill',
}: {
  value: number;
  delay?: number;
  axis?: 'x' | 'y';
  on?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useElementInView(ref);
  const reduced = useReducedMotion();
  const dataOn = on ? '' : undefined;

  const activeVal = inView || reduced ? value : 0;
  const transform = axis === 'x' ? `scaleX(${activeVal})` : `scaleY(${activeVal})`;

  return (
    <span
      ref={ref}
      className={className}
      data-on={dataOn}
      style={{
        transform,
        transition: reduced
          ? undefined
          : `transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s`,
      }}
    />
  );
}

export const IN_VIEW_PROPS = {};

export function MicroViz({ viz, className }: { viz: MicroVizConfig; className?: string }) {
  const cls = ['mvn-mviz', className].filter(Boolean).join(' ');

  if (viz.kind === 'segments') {
    const activeCount = Math.round(viz.value / 10);
    return (
      <span className={cls} data-kind="segments" aria-hidden="true">
        {Array.from({ length: 10 }, (_, idx) => (
          <ScaleFill
            key={idx}
            className="mvn-mviz__seg"
            axis="y"
            value={1}
            on={idx < activeCount}
            delay={0.04 + idx * 0.025}
          />
        ))}
      </span>
    );
  }

  if (viz.kind === 'dots' || viz.kind === 'ticks') {
    const total = viz.kind === 'dots' ? viz.total : viz.count;
    const filled = viz.kind === 'dots' ? viz.filled : viz.count;
    const itemClass = viz.kind === 'dots' ? 'mvn-mviz__dot' : 'mvn-mviz__tick';
    return (
      <span className={cls} data-kind={viz.kind} aria-hidden="true">
        {Array.from({ length: total }, (_, idx) => (
          <ScaleFill
            key={idx}
            className={itemClass}
            axis="y"
            value={1}
            on={idx < filled}
            delay={0.04 + idx * 0.02}
          />
        ))}
      </span>
    );
  }

  if (viz.kind === 'spark') {
    const min = Math.min(...viz.points);
    const max = Math.max(...viz.points);
    const coords = viz.points.map((pt, idx) => [
      (idx / (viz.points.length - 1)) * 100,
      34 - ((pt - min) / Math.max(1, max - min)) * 28,
    ]);
    const pathD = coords
      .map(([x, y], idx) => `${idx ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    const [lastX, lastY] = coords[coords.length - 1];

    return (
      <span className={cls} data-kind="spark" aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <line
            className="mvn-mviz__base"
            x1="0"
            x2="100"
            y1="34"
            y2="34"
            vectorEffect="non-scaling-stroke"
          />
          <path d={pathD} vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className="mvn-mviz__end"
          style={{ left: `${lastX}%`, top: `${(lastY / 40) * 100}%` }}
        />
      </span>
    );
  }

  return (
    <span className={cls} data-kind="bar" aria-hidden="true">
      <ScaleFill className="mvn-mviz__fill" value={viz.value / 100} delay={0.08} />
    </span>
  );
}

export function InfiniteTicker({
  children,
  gap,
  velocity,
  reverse = false,
  draggable = false,
  className,
}: {
  children: React.ReactNode;
  gap: number;
  velocity: number;
  reverse?: boolean;
  draggable?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [copies, setCopies] = useState(2);
  const stateRef = useRef({ offset: 0, setW: 0, dragging: false, lastX: 0, visible: true });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const firstSet = setRef.current;
    if (!container || !firstSet) return;
    const measure = () => {
      const w = firstSet.getBoundingClientRect().width + gap;
      stateRef.current.setW = w;
      setCopies(Math.max(2, Math.ceil(container.clientWidth / Math.max(1, w)) + 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(firstSet);
    return () => ro.disconnect();
  }, [gap]);

  useEffect(() => {
    if (reduced) return;
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;
    let prev = performance.now();

    const tick = (now: number) => {
      const st = stateRef.current;
      if (!st.visible) return;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (st.setW > 0) {
        if (!st.dragging) {
          st.offset += (reverse ? 1 : -1) * velocity * dt;
        }
        let wrapped = st.offset % st.setW;
        if (wrapped > 0) wrapped -= st.setW;
        st.offset = wrapped;
        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(${wrapped}px,0,0)`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        stateRef.current.visible = entry.isIntersecting;
        if (entry.isIntersecting) {
          prev = performance.now();
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(rafId);
        }
      },
      { threshold: 0.01 }
    );

    io.observe(container);
    rafId = requestAnimationFrame(tick);

    return () => {
      io.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [velocity, reverse, reduced]);

  const pointerHandlers = draggable
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          stateRef.current.dragging = true;
          stateRef.current.lastX = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          const st = stateRef.current;
          if (st.dragging) {
            st.offset += e.clientX - st.lastX;
            st.lastX = e.clientX;
          }
        },
        onPointerUp: () => {
          stateRef.current.dragging = false;
        },
        onPointerCancel: () => {
          stateRef.current.dragging = false;
        },
      }
    : {};

  return (
    <div
      ref={containerRef}
      className={['mvn-ticker', className].filter(Boolean).join(' ')}
      data-draggable={draggable || undefined}
      {...pointerHandlers}
    >
      <div ref={trackRef} className="mvn-ticker__track" style={{ gap }}>
        {Array.from({ length: copies }).map((_, idx) => (
          <div
            key={idx}
            ref={idx === 0 ? setRef : undefined}
            className="mvn-ticker__set"
            style={{ gap }}
            aria-hidden={idx > 0 || undefined}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
