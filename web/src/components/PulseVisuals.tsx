import React, { useEffect, useRef } from 'react';
import { motion, MotionValue, useReducedMotion } from 'framer-motion';
import { ZeroPulseMark } from './Icons';

/**
 * High-performance Canvas Hero Backdrop.
 * Uses zero-cost dual-pass strokes instead of expensive ctx.shadowBlur,
 * and pauses automatically via IntersectionObserver when scrolled out of view.
 */
export function PulseHeroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let rafId = 0;
    let isVisible = true;
    let width = 0;
    let height = 0;

    const particles = Array.from({ length: 28 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      r: 1.2 + (i % 3) * 0.8,
      speed: 0.00018 + (i % 5) * 0.00006,
      alpha: 0.25 + (i % 4) * 0.16,
      phase: i * 0.7,
    }));

    const resize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    const ecgSpike = (phase: number) => {
      const p = ((phase % 1) + 1) % 1;
      if (p > 0.42 && p < 0.45) return -0.18 * Math.sin(((p - 0.42) / 0.03) * Math.PI);
      if (p >= 0.45 && p < 0.49) return 0.95 * Math.sin(((p - 0.45) / 0.04) * Math.PI);
      if (p >= 0.49 && p < 0.53) return -0.42 * Math.sin(((p - 0.49) / 0.04) * Math.PI);
      if (p >= 0.56 && p < 0.64) return 0.24 * Math.sin(((p - 0.56) / 0.08) * Math.PI);
      return Math.sin(p * Math.PI * 2) * 0.05;
    };

    const drawFrame = (timeMs: number) => {
      const t = timeMs * 0.001;

      // 1. Deep Obsidian base
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, width, height);

      const cx = width * 0.5;
      const horizonY = height * 0.82;
      const beat = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 2.6)), 4);

      // 2. Volumetric Crimson Core Glow
      const coreGrad = ctx.createRadialGradient(
        cx,
        horizonY,
        10,
        cx,
        horizonY,
        Math.max(width, height) * 0.7
      );
      coreGrad.addColorStop(0, `rgba(255, 30, 56, ${(0.38 + beat * 0.12).toFixed(3)})`);
      coreGrad.addColorStop(0.26, `rgba(225, 29, 72, ${(0.2 + beat * 0.06).toFixed(3)})`);
      coreGrad.addColorStop(0.55, 'rgba(127, 29, 29, 0.08)');
      coreGrad.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Perspective Cyber Grid in Crimson (single batched path)
      ctx.strokeStyle = 'rgba(255, 38, 68, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gridTop = height * 0.56;
      const numHorizontal = 8;
      for (let i = 0; i <= numHorizontal; i++) {
        const frac = Math.pow(i / numHorizontal, 1.65);
        const y = gridTop + frac * (height - gridTop);
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      const numVertical = 14;
      for (let i = -numVertical; i <= numVertical; i++) {
        const bottomX = cx + (i / numVertical) * width * 1.3;
        const topX = cx + (i / numVertical) * width * 0.22;
        ctx.moveTo(topX, gridTop);
        ctx.lineTo(bottomX, height);
      }
      ctx.stroke();

      // 4. Concentric Pulsing Crimson Rings (no shadowBlur!)
      const arcRadiusBase = Math.min(width, height) * 0.56;
      for (let rIdx = 0; rIdx < 3; rIdx++) {
        const pulseExpand = ((t * 0.36 + rIdx * 0.33) % 1) * 130;
        const radius = arcRadiusBase + rIdx * 52 + pulseExpand;
        const alpha = Math.max(0, (1 - pulseExpand / 130) * (0.28 - rIdx * 0.06));
        ctx.beginPath();
        ctx.arc(cx, horizonY + radius * 0.52, radius, Math.PI * 1.12, Math.PI * 1.88);
        ctx.strokeStyle = `rgba(255, 45, 70, ${alpha.toFixed(3)})`;
        ctx.lineWidth = rIdx === 0 ? 2.2 : 1.3;
        ctx.stroke();
      }

      // 5. Layered Real-time ECG / Telemetry Pulse Waves (dual-stroke glow, zero shadowBlur)
      const waves = [
        { yBase: height * 0.68, amp: 64, speed: 0.28, color: '#ff1e38', glowColor: 'rgba(255, 30, 56, 0.22)', width: 2.4 },
        { yBase: height * 0.73, amp: 38, speed: -0.18, color: 'rgba(255, 107, 129, 0.55)', glowColor: '', width: 1.4 },
        { yBase: height * 0.63, amp: 26, speed: 0.14, color: 'rgba(190, 18, 60, 0.5)', glowColor: '', width: 1.2 },
      ];

      waves.forEach((w, wIdx) => {
        ctx.beginPath();
        const step = 8;
        for (let x = 0; x <= width; x += step) {
          const normX = x / width;
          const envelope = Math.sin(normX * Math.PI);
          const spike = ecgSpike(normX * 2.2 - t * w.speed + wIdx * 0.33);
          const harmonic =
            Math.sin(normX * 14 + t * 1.8 + wIdx) * 0.12 +
            Math.cos(normX * 7 - t * 1.1) * 0.08;
          const y = w.yBase - (spike + harmonic) * w.amp * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (w.glowColor) {
          ctx.strokeStyle = w.glowColor;
          ctx.lineWidth = 8;
          ctx.stroke();
        }
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.width;
        ctx.stroke();
      });

      // 6. Floating Crimson Telemetry Sparks (no shadowBlur!)
      particles.forEach((p) => {
        const py = ((p.y - t * p.speed * 60) % 1 + 1) % 1;
        const px = p.x + Math.sin(t * 0.8 + p.phase) * 0.015;
        const x = px * width;
        const y = py * height;
        const flicker = 0.55 + 0.45 * Math.sin(t * 3 + p.phase);

        ctx.fillStyle = `rgba(255, 56, 85, ${(p.alpha * flicker).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    if (reduced) {
      drawFrame(1450);
      return () => window.removeEventListener('resize', resize);
    }

    const loop = (now: number) => {
      if (!isVisible) return;
      drawFrame(now);
      rafId = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(loop);
        } else {
          cancelAnimationFrame(rafId);
        }
      },
      { threshold: 0.01 }
    );

    io.observe(canvas);
    rafId = requestAnimationFrame(loop);

    return () => {
      io.disconnect();
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [reduced]);

  return (
    <div className="zp-hero-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="zp-hero-backdrop__canvas" />
      <div className="zp-hero-backdrop__scanlines" />
      <div className="zp-hero-backdrop__vignette" />
    </div>
  );
}

/**
 * Bespoke Zeropulse Live Telemetry & Anomaly Pod HUD in black & crimson.
 */
export function LiveAgentPodMockup({
  title,
  accent,
  cta,
}: {
  title: string;
  accent: string;
  cta: string;
}) {
  return (
    <div className="zp-pod" aria-hidden="true">
      <div className="zp-pod__glow" />
      <div className="zp-pod__chassis">
        <div className="zp-pod__topbar">
          <span className="zp-pod__sensor">
            <span className="zp-pod__sensor-dot" />
            ZP-NODE // 01
          </span>
          <span className="zp-pod__status">FIRE · 92.4%</span>
        </div>

        <div className="zp-pod__monitor">
          <div className="zp-pod__monitor-head">
            <ZeroPulseMark size={18} color="#ff1e38" />
            <span className="zp-pod__mono">STREAM // CPU_USAGE</span>
            <span className="zp-pod__hz">500ms</span>
          </div>

          <div className="zp-pod__wavebox">
            <svg viewBox="0 0 260 90" preserveAspectRatio="none" className="zp-pod__wavesvg">
              <defs>
                <linearGradient id="zpPodFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff1e38" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#ff1e38" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line
                x1="0"
                y1="26"
                x2="260"
                y2="26"
                stroke="#ff1e38"
                strokeOpacity="0.35"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <path
                d="M0 64 L32 64 L44 48 L56 70 L70 18 L84 76 L98 42 L112 60 L148 60 L162 12 L176 78 L190 36 L206 58 L260 58 L260 90 L0 90 Z"
                fill="url(#zpPodFill)"
              />
              <path
                d="M0 64 L32 64 L44 48 L56 70 L70 18 L84 76 L98 42 L112 60 L148 60 L162 12 L176 78 L190 36 L206 58 L260 58"
                fill="none"
                stroke="#ff1e38"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="162" cy="12" r="4" fill="#ffffff" stroke="#ff1e38" strokeWidth="2" />
            </svg>
          </div>

          <div className="zp-pod__bars">
            <div className="zp-pod__bar-row">
              <span>CPU</span>
              <div className="zp-pod__bar-track">
                <div className="zp-pod__bar-fill" style={{ width: '92%' }} />
              </div>
              <b>92%</b>
            </div>
            <div className="zp-pod__bar-row">
              <span>RAM</span>
              <div className="zp-pod__bar-track">
                <div className="zp-pod__bar-fill zp-pod__bar-fill--dim" style={{ width: '64%' }} />
              </div>
              <b>64%</b>
            </div>
            <div className="zp-pod__bar-row">
              <span>DSK</span>
              <div className="zp-pod__bar-track">
                <div className="zp-pod__bar-fill zp-pod__bar-fill--dim" style={{ width: '48%' }} />
              </div>
              <b>48%</b>
            </div>
          </div>
        </div>

        <div className="zp-pod__copy">
          <p className="zp-pod__title">
            {title} <em>{accent}</em>
          </p>
          <span className="zp-pod__cta">{cta}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Scroll-driven Dual Crimson Telemetry Conduits & Central Pulse Core.
 */
export function StickyPulseConduits({
  leftX,
  rightX,
  activeIdx,
  totalSteps,
}: {
  leftX?: MotionValue<number>;
  rightX?: MotionValue<number>;
  activeIdx: number;
  totalSteps: number;
}) {
  const reduced = useReducedMotion();

  return (
    <>
      <motion.div
        className="mvn-chapter__half zp-conduit zp-conduit--left"
        style={reduced ? undefined : { x: leftX }}
      >
        <svg viewBox="0 0 520 320" className="zp-conduit__svg" aria-hidden="true">
          <defs>
            <linearGradient id="zpBeamLeft" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#ff1e38" stopOpacity="0.08" />
              <stop offset="55%" stopColor="#ff1e38" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ff4757" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M0 95 H230 L285 135 H455"
            fill="none"
            stroke="url(#zpBeamLeft)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <path
            d="M0 225 H230 L285 185 H455"
            fill="none"
            stroke="url(#zpBeamLeft)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <path
            d="M0 160 H180 L205 118 L230 204 L258 96 L284 212 L308 142 L330 160 H485"
            fill="none"
            stroke="url(#zpBeamLeft)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="475"
            cy="160"
            r="34"
            fill="rgba(255, 30, 56, 0.12)"
            stroke="#ff1e38"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <circle cx="475" cy="160" r="16" fill="#ff1e38" />
          <circle cx="475" cy="160" r="6" fill="#ffffff" />
          <text
            x="160"
            y="78"
            fill="#ff6b81"
            fontFamily="var(--font-mono)"
            fontSize="11"
            letterSpacing="2"
          >
            COLLECTOR // TELEMETRY INGRESS
          </text>
        </svg>
      </motion.div>

      <motion.div
        className="mvn-chapter__half zp-conduit zp-conduit--right"
        style={reduced ? undefined : { x: rightX }}
      >
        <svg viewBox="0 0 520 320" className="zp-conduit__svg" aria-hidden="true">
          <defs>
            <linearGradient id="zpBeamRight" x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stopColor="#ff1e38" stopOpacity="0.08" />
              <stop offset="55%" stopColor="#ff1e38" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ff4757" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M520 95 H290 L235 135 H65"
            fill="none"
            stroke="url(#zpBeamRight)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <path
            d="M520 225 H290 L235 185 H65"
            fill="none"
            stroke="url(#zpBeamRight)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <path
            d="M520 160 H340 L315 118 L290 204 L262 96 L236 212 L212 142 L190 160 H35"
            fill="none"
            stroke="url(#zpBeamRight)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="45"
            cy="160"
            r="34"
            fill="rgba(255, 30, 56, 0.12)"
            stroke="#ff1e38"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <circle cx="45" cy="160" r="16" fill="#ff1e38" />
          <circle cx="45" cy="160" r="6" fill="#ffffff" />
          <text
            x="175"
            y="78"
            fill="#ff6b81"
            fontFamily="var(--font-mono)"
            fontSize="11"
            letterSpacing="2"
          >
            RULE ENGINE // STAGE {activeIdx + 1}/{totalSteps}
          </text>
        </svg>
      </motion.div>
    </>
  );
}

/**
 * Zero-Dependency Crimson Radar & Binary Core animation.
 */
export function BentoRadarVisual() {
  const reduced = useReducedMotion();

  return (
    <div className="zp-radar" aria-hidden="true">
      <svg viewBox="0 0 200 200" className="zp-radar__svg">
        <defs>
          <radialGradient id="zpRadarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff1e38" stopOpacity="0.38" />
            <stop offset="70%" stopColor="#ff1e38" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ff1e38" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="88" fill="url(#zpRadarGlow)" />
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="rgba(255, 30, 56, 0.25)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <circle
          cx="100"
          cy="100"
          r="56"
          fill="none"
          stroke="rgba(255, 30, 56, 0.35)"
          strokeWidth="1.5"
        />
        <circle
          cx="100"
          cy="100"
          r="32"
          fill="rgba(255, 30, 56, 0.14)"
          stroke="#ff1e38"
          strokeWidth="2"
        />
        <line x1="12" y1="100" x2="188" y2="100" stroke="rgba(255, 30, 56, 0.2)" strokeWidth="1" />
        <line x1="100" y1="12" x2="100" y2="188" stroke="rgba(255, 30, 56, 0.2)" strokeWidth="1" />

        <motion.g
          style={{ originX: '100px', originY: '100px' }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 5, ease: 'linear', repeat: Infinity }}
        >
          <line
            x1="100"
            y1="100"
            x2="174"
            y2="62"
            stroke="#ff4757"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="148" cy="75" r="4" fill="#ffffff" stroke="#ff1e38" strokeWidth="2" />
        </motion.g>

        <path
          d="M74 100 H88 L94 84 L101 116 L108 90 L113 100 H126"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Scroll-linked Dual Synaptic Clamps (Duration & Cooldown State Gates).
 */
export function BentoSynapticClamps({
  leftX,
  rightX,
}: {
  leftX?: MotionValue<number>;
  rightX?: MotionValue<number>;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="zp-synapse" aria-hidden="true">
      <motion.div
        className="zp-synapse__node zp-synapse__node--left"
        style={reduced ? undefined : { x: leftX }}
      >
        <span className="zp-synapse__tag">DURATION // 3x</span>
        <span className="zp-synapse__prong" />
      </motion.div>

      <div className="zp-synapse__core">
        <motion.span
          className="zp-synapse__spark"
          animate={reduced ? undefined : { scale: [0.9, 1.25, 0.9], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
        />
      </div>

      <motion.div
        className="zp-synapse__node zp-synapse__node--right"
        style={reduced ? undefined : { x: rightX }}
      >
        <span className="zp-synapse__prong" />
        <span className="zp-synapse__tag">COOLDOWN // 60s</span>
      </motion.div>
    </div>
  );
}
