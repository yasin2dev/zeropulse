import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  ARCHITECTURE_CARDS_CONTENT,
  BENTO_CONTENT,
  FAQ_CONTENT,
  FOOTER_CONTENT,
  HERO_CONTENT,
  HOW_IT_WORKS_CONTENT,
  IconName,
  METRICS_SHOWCASE_CONTENT,
  MicroVizConfig,
  NAV_COLUMNS,
  OPERATING_MODES_CONTENT,
  OVERVIEW_CONTENT,
  PIPELINE_VIZ_DATA,
  STICKY_JOURNEY_CONTENT,
  TELEMETRY_VIZ_DATA,
} from '../data/content';
import { FlowWaveLines, Icon, ZeroPulseBrand, ZeroPulseMark } from './Icons';
import { LenisProvider, useHashScroll, useLenis } from './LenisProvider';
import {
  AnimatedCounter,
  BLUR_CONFIG,
  CircularRing,
  EASE_REVEAL,
  getHasPlayedIntro,
  IN_VIEW_PROPS,
  InfiniteTicker,
  MicroViz,
  NAV_DELAY,
  pad2,
  Preloader,
  Reveal,
  ScaleFill,
  SPRING_ACCORDION,
  SPRING_DEFAULT,
  SPRING_LIFT,
  SPRING_MENU,
  SPRING_NAV_IN,
  SPRING_SLOW,
  SPRING_TILT,
} from './MotionPrimitives';
import {
  BentoRadarVisual,
  BentoSynapticClamps,
  LiveAgentPodMockup,
  PulseHeroBackdrop,
  StickyPulseConduits,
} from './PulseVisuals';
import { RuleStudio } from './RuleStudio';

function useSmartLink() {
  const hashScroll = useHashScroll();
  const navigate = useNavigate();

  return useCallback(
    (e: React.MouseEvent, href: string) => {
      if (href.startsWith('#')) {
        hashScroll(e, href);
        return;
      }
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      e.preventDefault();
      navigate(href);
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    },
    [hashScroll, navigate]
  );
}

function MultiLineText({ lines }: { lines: string | string[] }) {
  const arr = typeof lines === 'string' ? [lines] : lines;
  return (
    <>
      {arr.map((line, idx) => (
        <React.Fragment key={line}>
          {idx > 0 ? <br /> : null}
          {line}
        </React.Fragment>
      ))}
    </>
  );
}

function SectionTitle({ title, text }: { title: string | string[]; text?: string }) {
  return (
    <div className="mvn-title">
      <Reveal className="mvn-title__reveal">
        <h2 className="mvn-h2">
          <MultiLineText lines={title} />
        </h2>
        {text ? <p className="mvn-p18 mvn-title__text">{text}</p> : null}
      </Reveal>
    </div>
  );
}

function FloatingNavbar({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const smartLink = useSmartLink();
  const { scrollTo } = useLenis();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleTop = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    const topEl = document.getElementById('top');
    if (topEl) scrollTo(topEl);
    else window.scrollTo({ top: 0 });
  };

  return (
    <motion.header
      className="mvn-nav"
      initial={reduced ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_NAV_IN, delay }}
    >
      <motion.nav
        className="mvn-nav__menu"
        data-open={open || undefined}
        layout={!reduced}
        transition={SPRING_MENU}
        style={{ borderRadius: 20 }}
        aria-label="Ana gezinme"
      >
        <motion.div
          className="mvn-nav__bar"
          layout={reduced ? false : 'position'}
          transition={SPRING_MENU}
        >
          <a
            className="mvn-nav__brandwrap"
            href="#top"
            onClick={handleTop}
            aria-label="Zeropulse — sayfa başı"
          >
            <span className="mvn-nav__logo">
              <ZeroPulseMark size={24} color="#ff1e38" />
            </span>
            <span className="mvn-nav__brandtext">
              ZERO<span className="mvn-nav__brandaccent">PULSE</span>
            </span>
          </a>

          <button
            type="button"
            className="mvn-nav__toggle"
            aria-expanded={open}
            aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
            onClick={() => setOpen((v) => !v)}
          >
            <motion.span
              className="mvn-nav__plus"
              animate={{ rotate: open ? 45 : 0 }}
              transition={SPRING_MENU}
            >
              <i />
              <i />
            </motion.span>
          </button>
        </motion.div>

        <motion.div
          className="mvn-nav__links"
          layout={reduced ? false : 'position'}
          animate={{ opacity: open ? 1 : 0 }}
          transition={SPRING_MENU}
          aria-hidden={!open}
        >
          {NAV_COLUMNS.map((col) => (
            <ul key={col.title} className="mvn-nav__col">
              <li>
                <h6 className="mvn-nav__head">{col.title}</h6>
              </li>
              {col.links.map((item) => (
                <li key={item.href}>
                  <a
                    className="mvn-nav__link"
                    href={item.href}
                    target={item.href.startsWith('http') ? '_blank' : undefined}
                    rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    onClick={(e) => {
                      setOpen(false);
                      smartLink(e, item.href);
                    }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </motion.div>
      </motion.nav>
    </motion.header>
  );
}

function HeroSection({ intro }: { intro: boolean }) {
  const reduced = useReducedMotion();
  const smartLink = useSmartLink();
  const calcDelay = (base: number) => (intro ? base : Math.max(0.05, base - 1.4));
  const fullTitle = HERO_CONTENT.title.map((t) => t.w).join(' ');

  return (
    <header className="mvn-hero" id="top">
      <div className="mvn-hero__media" aria-hidden="true">
        <PulseHeroBackdrop />
      </div>

      <div className="mvn-hero__content">
        <h1 className="mvn-hero__title" aria-label={fullTitle}>
          {HERO_CONTENT.title.map((word, idx) => (
            <React.Fragment key={idx}>
              <motion.span
                aria-hidden="true"
                className={word.accent ? 'mvn-hero__accent' : undefined}
                style={{ display: 'inline-block', whiteSpace: 'pre' }}
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: BLUR_CONFIG.word.duration,
                  ease: EASE_REVEAL,
                  delay: calcDelay(1.5) + idx * BLUR_CONFIG.word.stagger,
                }}
              >
                {word.w}
                {!word.br && idx < HERO_CONTENT.title.length - 1 ? ' ' : ''}
              </motion.span>
              {word.br ? <br /> : null}
            </React.Fragment>
          ))}
        </h1>

        <div className="mvn-hero__leadwrap">
          <motion.p
            className="mvn-hero__lead"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: BLUR_CONFIG.element.duration,
              ease: EASE_REVEAL,
              delay: calcDelay(1.6),
            }}
          >
            {HERO_CONTENT.lead}
          </motion.p>
        </div>

        <motion.div
          className="mvn-hero__buttons"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_REVEAL, delay: calcDelay(1.58) }}
        >
          <a
            className="mvn-btn mvn-btn--light"
            href={HERO_CONTENT.primary.href}
            onClick={(e) => smartLink(e, HERO_CONTENT.primary.href)}
          >
            {HERO_CONTENT.primary.label}
          </a>
          <a
            className="mvn-btn mvn-btn--dark"
            href={HERO_CONTENT.secondary.href}
            onClick={(e) => smartLink(e, HERO_CONTENT.secondary.href)}
          >
            {HERO_CONTENT.secondary.label}
          </a>
        </motion.div>
      </div>

      <div className="mvn-hero__companies" aria-hidden="true">
        <motion.div
          className="mvn-hero__companiesInner"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_REVEAL, delay: calcDelay(1.65) }}
        >
          <InfiniteTicker className="mvn-hero__ticker" gap={42} velocity={24} reverse>
            {HERO_CONTENT.journey.map((item) => (
              <span key={item} className="mvn-hero__logo">
                {item}
              </span>
            ))}
          </InfiniteTicker>
        </motion.div>
      </div>
    </header>
  );
}

function QuestionCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="mvn-ocard">
      <span className="mvn-badge">{title}</span>
      <p className="mvn-p">{text}</p>
    </div>
  );
}

function OverviewSection() {
  const [q1, q2, q3] = OVERVIEW_CONTENT.questions;
  return (
    <section id="neden" className="mvn-section mvn-overview">
      <SectionTitle title={OVERVIEW_CONTENT.title} text={OVERVIEW_CONTENT.text} />
      <div className="mvn-overview__row">
        <Reveal className="mvn-overview__col">
          <QuestionCard {...q1} />
          <QuestionCard {...q2} />
        </Reveal>
        <Reveal kind="tilt" transition={SPRING_TILT} className="mvn-overview__mockup">
          <LiveAgentPodMockup
            title={OVERVIEW_CONTENT.screen.title}
            accent={OVERVIEW_CONTENT.screen.accent}
            cta={HERO_CONTENT.primary.label}
          />
        </Reveal>
        <Reveal className="mvn-overview__col">
          <QuestionCard {...q3} />
        </Reveal>
      </div>
    </section>
  );
}

function TelemetryMatrixViz({
  label,
  note,
  total,
  dimensions,
}: typeof TELEMETRY_VIZ_DATA) {
  return (
    <div
      className="mvn-viz"
      role="img"
      aria-label={`${label} (${note}): ${dimensions.map((d) => `${d.name} ${d.score}`).join(', ')}`}
    >
      <div className="mvn-viz__head">
        <span className="mvn-viz__label">{label}</span>
        <span className="mvn-viz__note">
          {note} · %{total}
        </span>
      </div>
      <ol className="mvn-viz__rows">
        {dimensions.map((dim, idx) => (
          <li key={dim.name} className="mvn-viz__row">
            <span className="mvn-viz__n">{pad2(idx + 1)}</span>
            <span className="mvn-viz__name">{dim.name}</span>
            <span className="mvn-viz__track">
              <ScaleFill value={dim.score / 100} delay={0.08 + idx * 0.03} />
            </span>
            <span className="mvn-viz__v">{dim.score}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PipelineChecklistViz({ label, done, total, tasks }: typeof PIPELINE_VIZ_DATA) {
  return (
    <div
      className="mvn-viz"
      role="img"
      aria-label={`${label}: ${total} adımdan ${done} tanesi aktif`}
    >
      <div className="mvn-viz__head">
        <span className="mvn-viz__label">{label}</span>
        <span className="mvn-viz__note">
          {done} / {total} aktif katman
        </span>
      </div>
      <span className="mvn-viz__progress">
        <ScaleFill value={done / total} delay={0.1} />
      </span>
      <ul className="mvn-plan">
        {tasks.map((task) => (
          <li key={task.title} className="mvn-plan__task" data-done={task.done || undefined}>
            <span className="mvn-plan__check">
              {task.done ? (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 8.5 7 11.5 12 5" />
                </svg>
              ) : null}
            </span>
            <span className="mvn-plan__title">{task.title}</span>
            <span className="mvn-plan__area">{task.area}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCounterCard({
  end,
  prefix = '0',
  title,
  text,
}: {
  end: number;
  prefix?: string;
  title: string;
  text: string;
}) {
  return (
    <div className="mvn-ccard">
      <AnimatedCounter end={end} prefix={prefix} className="mvn-ccard__n" />
      <div className="mvn-ccard__tt">
        <h6 className="mvn-h6">{title}</h6>
        <p className="mvn-p">{text}</p>
      </div>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <section id="nasil-calisir" className="mvn-section mvn-about">
      <SectionTitle title={HOW_IT_WORKS_CONTENT.title} />
      <div className="mvn-about__container">
        {HOW_IT_WORKS_CONTENT.rows.map((row, idx) => {
          const media = (
            <Reveal kind={idx === 0 ? 'left' : 'right'} className="mvn-about__media">
              <div className="mvn-wallcard">
                <div className="mvn-wallcard__image">
                  {row.visual === 'readiness' ? (
                    <TelemetryMatrixViz {...TELEMETRY_VIZ_DATA} />
                  ) : (
                    <PipelineChecklistViz {...PIPELINE_VIZ_DATA} />
                  )}
                </div>
              </div>
            </Reveal>
          );

          const content = (
            <div className="mvn-about__content">
              <Reveal kind="fade" transition={SPRING_SLOW} className="mvn-about__h3">
                <h3 className="mvn-h3">{row.title}</h3>
              </Reveal>
              <div className="mvn-about__counters">
                {row.steps.map((step) => (
                  <StepCounterCard
                    key={step.n}
                    end={step.n}
                    prefix="0"
                    title={step.title}
                    text={step.text}
                  />
                ))}
              </div>
            </div>
          );

          return (
            <div
              key={row.id}
              id={row.id}
              className="mvn-about__row"
              data-reverse={idx === 1 || undefined}
            >
              {idx === 0 ? media : content}
              {idx === 0 ? content : media}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StickyJourneySection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const steps = STICKY_JOURNEY_CONTENT.steps;
  const lastIdx = steps.length - 1;
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const totalScrollable = Math.max(1, rect.height - window.innerHeight * 0.5);
      const scrolled = window.innerHeight * 0.65 - rect.top;
      const val = Math.max(0, Math.min(1, scrolled / totalScrollable));

      let idx = 0;
      STICKY_JOURNEY_CONTENT.thresholds.forEach((t, i) => {
        if (val >= t) idx = i;
      });
      setActiveIdx((prev) => (prev === idx ? prev : idx));
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section ref={sectionRef} className="mvn-chapter" aria-labelledby="yolculuk-baslik">
      <h2 id="yolculuk-baslik" className="mvn-sr">
        {STICKY_JOURNEY_CONTENT.label}
      </h2>
      <ol className="mvn-sr">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <div className="mvn-chapter__stage">
        <div className="mvn-journey" aria-hidden="true">
          <div className="mvn-journey__readout">
            <span className="mvn-journey__count">
              PULSE PIPELINE · {pad2(activeIdx + 1)} / {pad2(steps.length)}
            </span>
            <div className="mvn-journey__titles">
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  key={activeIdx}
                  className="mvn-journey__title"
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: EASE_REVEAL }}
                >
                  {steps[activeIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <div className="mvn-journey__track">
            <span className="mvn-journey__line">
              <span
                className="mvn-journey__fill"
                style={{
                  transform: `scaleX(${activeIdx / lastIdx})`,
                  transition: 'transform 0.3s ease',
                }}
              />
            </span>
            <ol className="mvn-journey__nodes">
              {steps.map((step, idx) => (
                <li
                  key={step}
                  className="mvn-journey__node"
                  data-state={idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'next'}
                  onClick={() => setActiveIdx(idx)}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                >
                  <span className="mvn-journey__dot" />
                  <span className="mvn-journey__label">
                    <span className="mvn-journey__n">{pad2(idx + 1)}</span>
                    <span className="mvn-journey__name">{step}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <StickyPulseConduits
          activeIdx={activeIdx}
          totalSteps={steps.length}
        />
      </div>
    </section>
  );
}

function ArchitectureCard({
  index,
  title,
  icon,
  tone,
}: {
  index: number;
  title: string;
  icon: IconName;
  tone: 'light' | 'dark';
}) {
  return (
    <div className="mvn-course" data-tone={tone}>
      <span className="mvn-course__dots" aria-hidden="true" />
      <Icon name={icon} className="mvn-course__icon" />
      <span className="mvn-course__n">{pad2(index)}</span>
      <span className="mvn-course__title">{title}</span>
    </div>
  );
}

function ArchitectureTickerSection() {
  const smartLink = useSmartLink();
  return (
    <section id="mimari" className="mvn-products">
      <SectionTitle
        title={ARCHITECTURE_CARDS_CONTENT.title}
        text={ARCHITECTURE_CARDS_CONTENT.text}
      />
      <Reveal kind="fade" transition={SPRING_DEFAULT} className="mvn-products__reveal">
        <InfiniteTicker className="mvn-products__ticker" gap={24} velocity={30} draggable>
          {ARCHITECTURE_CARDS_CONTENT.categories.map((cat, idx) => (
            <div key={cat.title} className="mvn-products__item">
              <ArchitectureCard
                index={idx + 1}
                title={cat.title}
                icon={cat.icon}
                tone={idx % 2 ? 'light' : 'dark'}
              />
            </div>
          ))}
        </InfiniteTicker>
      </Reveal>
      <Reveal kind="lift" transition={SPRING_LIFT} className="mvn-products__cta">
        <a
          className="mvn-btn mvn-btn--ink"
          href={ARCHITECTURE_CARDS_CONTENT.cta.href}
          onClick={(e) => smartLink(e, ARCHITECTURE_CARDS_CONTENT.cta.href)}
        >
          {ARCHITECTURE_CARDS_CONTENT.cta.label}
        </a>
      </Reveal>
    </section>
  );
}

function BentoText({ title, text, wide }: { title: string; text?: string; wide?: boolean }) {
  return (
    <div className="mvn-bento__text" data-wide={wide || undefined}>
      <h5 className="mvn-h5">{title}</h5>
      {text ? <p className="mvn-p">{text}</p> : null}
    </div>
  );
}

function FlowTile({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className="mvn-tile" data-side={side}>
      <span className="mvn-tile__depth" />
      <motion.span
        className="mvn-tile__pulse"
        animate={reduced ? undefined : { scale: [1, 1.24], opacity: [0.55, 0] }}
        transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
      />
      <span className="mvn-tile__glow" />
      <div className="mvn-tile__face">
        {children}
        <span className="mvn-tile__border" />
      </div>
    </div>
  );
}

function BentoFastCell() {
  return (
    <div className="mvn-bento" data-cell="fast">
      <div className="mvn-bento__card">
        <div className="mvn-bento__visual">
          <BentoRadarVisual />
        </div>
      </div>
      <BentoText {...BENTO_CONTENT.next} />
    </div>
  );
}

function BentoRingsCell() {
  const { growth } = BENTO_CONTENT;
  return (
    <div className="mvn-bento" data-cell="seo">
      <div className="mvn-bento__card" data-pad="24">
        <svg className="mvn-bento__word" viewBox="0 0 110 19" aria-hidden="true">
          <text
            x="55"
            y="15.5"
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="currentColor"
          >
            {growth.word}
          </text>
        </svg>
        <div className="mvn-rings">
          {growth.rings.map((ring) => (
            <div key={ring.label} className="mvn-rings__item">
              <CircularRing from={ring.from} value={ring.value} suffix="%" size={ring.size} />
              <p className="mvn-rings__label">{ring.label}</p>
            </div>
          ))}
        </div>
      </div>
      <BentoText title={growth.title} text={growth.text} wide />
    </div>
  );
}

function BentoFlowCell() {
  return (
    <div className="mvn-bento" data-cell="next">
      <div className="mvn-bento__card" data-pad="20">
        <div className="mvn-flow">
          <FlowTile side="left">
            <ZeroPulseMark size={52} color="#ff1e38" />
          </FlowTile>
          <FlowWaveLines />
          <FlowTile side="right">
            <Icon name="path" className="mvn-tile__icon" />
          </FlowTile>
        </div>
      </div>
      <BentoText {...BENTO_CONTENT.process} wide />
    </div>
  );
}

function BentoHandsCell() {
  return (
    <div className="mvn-bento" data-cell="support">
      <div className="mvn-bento__card">
        <BentoSynapticClamps />
      </div>
      <BentoText {...BENTO_CONTENT.gaps} />
    </div>
  );
}

function BentoWhySection() {
  return (
    <section id="avantajlar" className="mvn-section mvn-why">
      <SectionTitle title={BENTO_CONTENT.title} text={BENTO_CONTENT.text} />
      <div className="mvn-why__grid">
        <BentoFastCell />
        <BentoRingsCell />
        <BentoFlowCell />
        <BentoHandsCell />
      </div>
    </section>
  );
}

function OperatingModesSection() {
  return (
    <section id="calisma-modlari" className="mvn-section mvn-features">
      <SectionTitle title={OPERATING_MODES_CONTENT.title} text={OPERATING_MODES_CONTENT.text} />
      <div className="mvn-features__grid">
        {OPERATING_MODES_CONTENT.paths.map((item) => (
          <Reveal
            key={item.title}
            kind="lift"
            transition={SPRING_LIFT}
            className="mvn-cell"
          >
            <div className="mvn-fcard">
              <div className="mvn-fcard__content">
                <div className="mvn-fcard__head">
                  <Icon name={item.icon} className="mvn-fcard__icon" />
                  <h5 className="mvn-h5">{item.title}</h5>
                </div>
                <p className="mvn-p mvn-fcard__text">{item.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function MetricNumber({
  value,
  start,
  prefix,
  unit,
  className,
}: {
  value: number;
  start?: number;
  prefix?: string;
  unit?: string;
  className?: string;
}) {
  return (
    <p className="mvn-metric">
      <AnimatedCounter end={value} start={start} prefix={prefix} className={className} />
      {unit ? <span className="mvn-metric__unit">{unit}</span> : null}
    </p>
  );
}

function TelemetryMetricCard({
  label,
  icon,
  viz,
  value,
  start,
  prefix,
  unit,
}: {
  label: string;
  icon: IconName;
  viz: MicroVizConfig;
  value: number;
  start?: number;
  prefix?: string;
  unit?: string;
}) {
  return (
    <div className="mvn-tcard">
      <div className="mvn-tcard__content">
        <Icon name={icon} className="mvn-tcard__icon" />
        <h5 className="mvn-h5">{label}</h5>
      </div>
      <div className="mvn-tcard__foot">
        <MetricNumber
          value={value}
          start={start}
          prefix={prefix}
          unit={unit}
          className="mvn-ccard__n"
        />
        <MicroViz viz={viz} />
      </div>
    </div>
  );
}

function BrandStatementCard({ lines, icon }: { lines: string[]; icon: IconName }) {
  return (
    <div className="mvn-tcard mvn-tcard--crimson">
      <div className="mvn-tcard__content">
        <Icon name={icon} className="mvn-tcard__icon" />
        <h5 className="mvn-h5">
          <MultiLineText lines={lines} />
        </h5>
      </div>
      <div className="mvn-tcard__foot">
        <span className="mvn-tcard__brand">
          <ZeroPulseMark size={22} color="#ff1e38" />
          <span>
            ZERO<em style={{ fontStyle: 'normal', color: '#ff1e38' }}>PULSE</em>
          </span>
        </span>
      </div>
    </div>
  );
}

function MetricsShowcaseSection() {
  const [first, ...rest] = METRICS_SHOWCASE_CONTENT.metrics;
  return (
    <section id="telemetri" className="mvn-section mvn-testi">
      <SectionTitle title={METRICS_SHOWCASE_CONTENT.title} />
      <div className="mvn-testi__grid">
        <Reveal kind="lift" transition={SPRING_LIFT} className="mvn-win">
          <MicroViz viz={first.viz} className="mvn-win__viz" />
          <MetricNumber
            value={first.value}
            start={first.start}
            prefix={first.prefix}
            unit={first.unit}
            className="mvn-win__n"
          />
          <h5 className="mvn-h5">{first.label}</h5>
        </Reveal>

        {rest.map((m) => (
          <Reveal key={m.label} kind="lift" transition={SPRING_LIFT} className="mvn-cell">
            <TelemetryMetricCard {...m} />
          </Reveal>
        ))}

        <Reveal kind="lift" transition={SPRING_LIFT} className="mvn-cell">
          <BrandStatementCard
            lines={METRICS_SHOWCASE_CONTENT.statement.lines}
            icon={METRICS_SHOWCASE_CONTENT.statement.icon}
          />
        </Reveal>
      </div>
    </section>
  );
}

function RuleStudioSection() {
  return (
    <section id="kurulum" className="mvn-section zp-studio">
      <SectionTitle
        title={['Kuralını tanımla.', 'Çıktıyı anında simüle et.']}
        text="Zeropulse herhangi bir kod değişikliği gerektirmeden YAML veya JSON kurallarıyla çalışır. Eşik değerlerini aşağıdan özelleştir, konfigürasyonunu kopyala ve tek komutla başlat."
      />
      <RuleStudio />
    </section>
  );
}

function FaqAccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="mvn-acc"
      data-open={open || undefined}
      layout={!reduced}
      transition={SPRING_ACCORDION}
      style={{ borderRadius: 20 }}
    >
      <motion.span
        className="mvn-acc__plus"
        layout={reduced ? false : 'position'}
        animate={{ rotate: open ? 135 : 0 }}
        transition={SPRING_ACCORDION}
        aria-hidden="true"
      >
        <i />
        <i />
      </motion.span>
      <motion.button
        layout={reduced ? false : 'position'}
        type="button"
        className="mvn-acc__q"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mvn-h6 mvn-acc__qt">{question}</span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="mvn-acc__a"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING_ACCORDION}
          >
            <p className="mvn-p">{answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function FaqSection() {
  return (
    <section id="sss" className="mvn-section mvn-faq">
      <SectionTitle title={FAQ_CONTENT.title} />
      <div className="mvn-faq__list">
        {FAQ_CONTENT.items.map((item, idx) => (
          <Reveal
            key={item.question}
            kind="lift"
            transition={SPRING_LIFT}
            delay={(FAQ_CONTENT.delays[idx] ?? 0) / 1000}
            className="mvn-faq__item"
          >
            <FaqAccordionItem {...item} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function AutoFitWordmark({ text }: { text: string }) {
  const textRef = useRef<SVGTextElement | null>(null);
  const [viewBox, setViewBox] = useState('0 -72 680 72');

  useLayoutEffect(() => {
    const measure = () => {
      const el = textRef.current;
      if (!el) return;
      const bbox = el.getBBox();
      if (bbox.width <= 0) return;
      let [x, y, w, h] = [bbox.x, bbox.y, bbox.width, bbox.height];
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        const cs = getComputedStyle(el);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in ctx) {
          (ctx as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
        }
        const m = ctx.measureText(text);
        if (m.actualBoundingBoxRight > 0) {
          x = -m.actualBoundingBoxLeft;
          y = -m.actualBoundingBoxAscent;
          w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
          h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        }
      }
      setViewBox(`${x} ${y} ${w} ${h}`);
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [text]);

  return (
    <svg className="mvn-footer__wordmark" viewBox={viewBox} aria-hidden="true">
      <defs>
        <linearGradient id="zpWordmarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="44%" stopColor="#f8fafc" />
          <stop offset="45%" stopColor="#ff1e38" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <text ref={textRef} x="0" y="0" className="mvn-footer__wordmarkText">
        {text}
      </text>
    </svg>
  );
}

function FooterSection() {
  const smartLink = useSmartLink();
  const { scrollTo } = useLenis();

  return (
    <footer className="mvn-footer">
      <div className="mvn-footer__container">
        <a
          className="mvn-footer__logo"
          href="#top"
          aria-label="Zeropulse — sayfa başı"
          onClick={(e) => {
            e.preventDefault();
            const topEl = document.getElementById('top');
            if (topEl) scrollTo(topEl);
            else window.scrollTo({ top: 0 });
          }}
        >
          <ZeroPulseMark size={24} color="#ff1e38" />
        </a>

        <div className="mvn-footer__ns">
          <div className="mvn-footer__newsletter">
            <div className="mvn-footer__desc">
              <h5 className="mvn-footer__h5">{FOOTER_CONTENT.brandTitle}</h5>
              <p className="mvn-footer__text">{FOOTER_CONTENT.brandText}</p>
            </div>
          </div>

          <nav className="mvn-footer__sitemap" aria-label="Site haritası">
            {FOOTER_CONTENT.columns.map((col) => (
              <div key={col.title} className="mvn-footer__col">
                <h6 className="mvn-footer__h6">{col.title}</h6>
                <ul className="mvn-footer__links">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <a
                        className="mvn-footer__link"
                        href={link.href}
                        target={link.href.startsWith('http') ? '_blank' : undefined}
                        rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        onClick={(e) => smartLink(e, link.href)}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <Reveal className="mvn-footer__name">
          <AutoFitWordmark text={FOOTER_CONTENT.wordmark} />
        </Reveal>

        <div className="mvn-footer__bottom">
          <div className="mvn-footer__social">
            {FOOTER_CONTENT.social.map((soc) => (
              <a
                key={soc.href}
                className="mvn-footer__socialLink"
                href={soc.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={soc.label}
              >
                <Icon name={soc.icon} className="mvn-footer__socialIcon" />
              </a>
            ))}
          </div>
          <p className="mvn-footer__credit">{FOOTER_CONTENT.credit}</p>
        </div>
      </div>
    </footer>
  );
}

function LandingInner() {
  const [shouldPlayIntro] = useState(() => !getHasPlayedIntro());
  const [introActive, setIntroActive] = useState(shouldPlayIntro);

  return (
    <div className="mvn" data-intro={introActive || undefined}>
      {introActive ? <Preloader onDone={() => setIntroActive(false)} /> : null}
      <FloatingNavbar delay={shouldPlayIntro ? NAV_DELAY.intro : NAV_DELAY.instant} />
      <main className="mvn-main">
        <HeroSection intro={shouldPlayIntro} />
        <OverviewSection />
        <HowItWorksSection />
        <StickyJourneySection />
        <ArchitectureTickerSection />
        <BentoWhySection />
        <OperatingModesSection />
        <MetricsShowcaseSection />
        <RuleStudioSection />
        <FaqSection />
      </main>
      <FooterSection />
    </div>
  );
}

export function LandingPage() {
  return (
    <LenisProvider>
      <LandingInner />
    </LenisProvider>
  );
}

export function StudioPage() {
  return (
    <div className="mvn mvn-eapage">
      <header className="mvn-eapage__bar">
        <Link to="/" className="mvn-eapage__brand" aria-label="Zeropulse ana sayfa">
          <ZeroPulseBrand size={18} color="#f8fafc" />
        </Link>
        <Link to="/" className="mvn-btn mvn-btn--ink">
          Ana Sayfaya Dön
        </Link>
      </header>
      <main className="mvn-eapage__body">
        <div className="mvn-eapage__intro">
          <h1 className="mvn-h2">Zeropulse Kural Stüdyosu.</h1>
          <p className="mvn-p18 mvn-eapage__lead">
            Docker ve Standalone sunucuların için eşik kurallarını oluştur, YAML veya JSON olarak
            indir ve dry-run modunda test et.
          </p>
        </div>
        <RuleStudio />
      </main>
    </div>
  );
}
