import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  IconDefinition,
  faArrowRight,
  faBolt,
  faCircleCheck,
  faCircleExclamation,
  faClock,
  faPlugCircleXmark,
  faShieldHalved,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import {
  AuditEntry,
  ConnectionState,
  ContainerCard,
  HealthStatus,
  RulesResponse,
  SystemOverview,
  TelemetrySample,
} from '../../types';
import {
  formatByteRate,
  formatBytes,
  formatClock,
  formatPercent,
  formatTime,
} from '../../i18n';
import { routeHref, RouteId } from '../../navigation';
import { eventTone, TONE_STYLES } from '../../utils/audit';
import { RemediationToggle } from '../automation/RemediationToggle';
import { ChartLegend, ChartSeries, LineChart } from './LineChart';

type Level = 'ok' | 'warn' | 'danger';

const RANGES = [
  { id: '5m', ms: 5 * 60_000 },
  { id: '15m', ms: 15 * 60_000 },
  { id: '1h', ms: 60 * 60_000 },
] as const;

const SAMPLE_INTERVAL_MS = 5_000;
const TOP_CONSUMER_COUNT = 7;
const EVENT_BUCKETS = 30;
const RECENT_EVENT_COUNT = 5;
const ATTENTION_NAME_COUNT = 3;
const MIN_RATE_SCALE_BYTES = 1024;

const hostCpuLevel = (v: number): Level => (v > 85 ? 'danger' : v > 65 ? 'warn' : 'ok');
const hostMemLevel = (v: number): Level => (v > 85 ? 'danger' : v > 70 ? 'warn' : 'ok');
const stressLevel = (v: number): Level => (v >= 0.7 ? 'danger' : v >= 0.3 ? 'warn' : 'ok');
const containerCpuLevel = (v: number): Level => (v > 80 ? 'danger' : v > 60 ? 'warn' : 'ok');
const containerMemLevel = (v: number): Level => (v > 85 ? 'danger' : v > 70 ? 'warn' : 'ok');

const worst = (...levels: Level[]): Level =>
  levels.includes('danger') ? 'danger' : levels.includes('warn') ? 'warn' : 'ok';

const LEVEL_ICON: Record<Level, IconDefinition> = {
  ok: faCircleCheck,
  warn: faTriangleExclamation,
  danger: faCircleExclamation,
};

interface DashboardProps {
  system: SystemOverview;
  containers: ContainerCard[];
  auditLogs: AuditEntry[];
  history: TelemetrySample[];
  dryRun: boolean;
  connectionState: ConnectionState;
  lastUpdated: Date | null;
  actionLoading: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
}

const PanelLink: React.FC<{ route: RouteId; label: string }> = ({ route, label }) => (
  <a className="panel-link" href={routeHref(route)}>
    <span>{label}</span>
    <FontAwesomeIcon icon={faArrowRight} />
  </a>
);

/* -------------------------------------------------------------------------- */
/* Headline: the answer to "is anything wrong right now?"                      */
/* -------------------------------------------------------------------------- */

const Vital: React.FC<{
  label: string;
  value: string;
  detail: string;
  percent?: number;
  level?: Level;
  levelLabel?: string;
}> = ({ label, value, detail, percent, level = 'ok', levelLabel }) => (
  <div className="vital">
    <span className="vital-label">{label}</span>
    <span className="vital-value tabular">{value}</span>
    {percent !== undefined && (
      <span className="vital-meter">
        <span className={`vital-meter-fill ${level}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
    )}
    <span className="vital-detail">
      {level !== 'ok' && levelLabel ? (
        <span className={`vital-flag ${level}`}>
          <FontAwesomeIcon icon={LEVEL_ICON[level]} /> {levelLabel}
        </span>
      ) : (
        detail
      )}
    </span>
  </div>
);

const Headline: React.FC<{
  system: SystemOverview;
  containers: ContainerCard[];
  connectionState: ConnectionState;
  lastUpdated: Date | null;
}> = ({ system, containers, connectionState, lastUpdated }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const hasData = lastUpdated !== null;

  const cpu = Math.min(100, Math.max(0, system.system_cpu_percent));
  const memTotal = system.system_mem_total_bytes;
  const memUsed = system.system_mem_used_bytes;
  const mem = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const stress = system.stress_index_1m || 0;

  const critical = containers.filter((c) => c.health_status === 'critical');
  const warning = containers.filter((c) => c.health_status === 'warning');
  const attention = [...critical, ...warning];
  const hostLevel = worst(hostCpuLevel(cpu), hostMemLevel(mem), stressLevel(stress));

  let tone: Level | 'neutral' = worst(
    critical.length > 0 ? 'danger' : warning.length > 0 ? 'warn' : 'ok',
    hostLevel
  );
  let icon: IconDefinition = LEVEL_ICON[tone];
  let title: string;
  let detail: React.ReactNode;

  if (!hasData) {
    tone = 'neutral';
    icon = faClock;
    title = t('dashboard.verdict_waiting');
    detail = t('dashboard.verdict_waiting_detail');
  } else if (connectionState !== 'connected') {
    tone = 'warn';
    icon = faPlugCircleXmark;
    title = t('dashboard.verdict_stale');
    detail = t('dashboard.verdict_stale_detail', { time: formatTime(lastUpdated, lang) });
  } else if (attention.length > 0) {
    const names = attention.slice(0, ATTENTION_NAME_COUNT).map((c) => c.name || c.id.slice(0, 12));
    const hidden = attention.length - names.length;
    title = t('dashboard.verdict_attention', { count: attention.length });
    detail = (
      <a className="headline-link" href={routeHref('workloads/attention')}>
        {names.join(', ')}
        {hidden > 0 && ` ${t('dashboard.verdict_more', { count: hidden })}`}
        <FontAwesomeIcon icon={faArrowRight} />
      </a>
    );
  } else if (hostLevel !== 'ok') {
    title = t('dashboard.verdict_host_load');
    detail = stress >= 0.7 ? t('pulse.note_critical') : t('pulse.note_high');
  } else {
    title = containers.length > 0 ? t('dashboard.verdict_ok') : t('dashboard.verdict_ok_host');
    detail = t('pulse.note_nominal');
  }

  return (
    <section className="headline-band" aria-label={t('dashboard.summary_label')}>
      <div className="headline-verdict">
        <span className={`headline-icon ${tone}`}>
          <FontAwesomeIcon icon={icon} />
        </span>
        <div className="headline-text">
          <h2 className="headline-title">{title}</h2>
          <p className="headline-detail">{detail}</p>
        </div>
      </div>

      <div className="headline-vitals">
        <Vital
          label={t('dashboard.vital_cpu')}
          value={hasData ? formatPercent(cpu, lang) : '—'}
          detail={system.mode === 'docker' ? t('navbar.docker_engine') : t('navbar.host_native')}
          percent={hasData ? cpu : 0}
          level={hostCpuLevel(cpu)}
          levelLabel={cpu > 85 ? t('pulse.status_critical') : t('pulse.status_high_load')}
        />
        <Vital
          label={t('dashboard.vital_memory')}
          value={hasData ? formatPercent(mem, lang) : '—'}
          detail={hasData ? `${formatBytes(memUsed)} / ${formatBytes(memTotal)}` : '—'}
          percent={hasData ? mem : 0}
          level={hostMemLevel(mem)}
          levelLabel={`${formatBytes(memUsed)} / ${formatBytes(memTotal)}`}
        />
        <Vital
          label={t('dashboard.vital_containers')}
          value={hasData ? `${system.running_containers} / ${system.total_containers}` : '—'}
          detail={t('dashboard.vital_containers_detail')}
        />
        <Vital
          label={t('dashboard.vital_stress')}
          value={hasData ? stress.toFixed(2) : '—'}
          detail={t('pulse.stress_level_low')}
          percent={hasData ? stress * 100 : 0}
          level={stressLevel(stress)}
          levelLabel={stress >= 0.7 ? t('pulse.stress_level_critical') : t('pulse.stress_level_high')}
        />
      </div>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Time-based charts                                                           */
/* -------------------------------------------------------------------------- */

const TrendPanel: React.FC<{
  className: string;
  title: string;
  subtitle: string;
  ariaLabel: string;
  samples: TelemetrySample[];
  series: ChartSeries[];
  rangeMs: number;
  yMax?: number;
  minYMax?: number;
  unitBase?: number;
  gutters?: { left: number; right: number };
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  emptyLabel: string;
}> = ({ className, title, subtitle, samples, series, ...chart }) => {
  const { i18n } = useTranslation();
  const times = useMemo(() => samples.map((s) => s.time), [samples]);

  return (
    <section className={`dash-panel ${className}`}>
      <header className="panel-head">
        <div>
          <h3 className="panel-heading">{title}</h3>
          <p className="panel-sub">{subtitle}</p>
        </div>
        <ChartLegend series={series} />
      </header>
      <LineChart
        {...chart}
        times={times}
        series={series}
        gapMs={SAMPLE_INTERVAL_MS * 3}
        formatAxisTime={(time) => formatClock(time, i18n.language)}
        formatCursorTime={(time) => formatTime(time, i18n.language)}
      />
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Workload health                                                             */
/* -------------------------------------------------------------------------- */

const HEALTH_ROWS: {
  status: HealthStatus;
  labelKey: string;
  icon: IconDefinition;
  segment: string;
  route: RouteId;
}[] = [
  { status: 'critical', labelKey: 'containers.status_critical', icon: faCircleExclamation, segment: 'danger', route: 'workloads/attention' },
  { status: 'warning', labelKey: 'containers.status_warning', icon: faTriangleExclamation, segment: 'warn', route: 'workloads/attention' },
  { status: 'cooldown', labelKey: 'containers.status_cooldown', icon: faClock, segment: 'neutral', route: 'workloads/healthy' },
  { status: 'ok', labelKey: 'containers.status_ok', icon: faCircleCheck, segment: 'ok', route: 'workloads/healthy' },
];

const HealthPanel: React.FC<{ containers: ContainerCard[] }> = ({ containers }) => {
  const { t } = useTranslation();
  const counts = (status: HealthStatus) => containers.filter((c) => c.health_status === status).length;

  return (
    <section className="dash-panel area-health">
      <header className="panel-head">
        <h3 className="panel-heading">{t('dashboard.health_title')}</h3>
        <PanelLink route="workloads/all" label={t('dashboard.view_all')} />
      </header>

      {containers.length === 0 ? (
        <p className="panel-empty">{t('dashboard.health_empty')}</p>
      ) : (
        <>
          <div className="health-bar" aria-hidden="true">
            {HEALTH_ROWS.map(({ status, segment }) => {
              const count = counts(status);
              return count > 0 ? (
                <span key={status} className={`health-seg ${segment}`} style={{ flexGrow: count }} />
              ) : null;
            })}
          </div>
          <ul className="health-list">
            {HEALTH_ROWS.map(({ status, labelKey, icon, segment, route }) => (
              <li key={status}>
                <a className="health-row" href={routeHref(route)}>
                  <FontAwesomeIcon icon={icon} fixedWidth className={`health-icon ${segment}`} />
                  <span className="health-label">{t(labelKey)}</span>
                  <span className="health-count tabular">{counts(status)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Remediation policy                                                          */
/* -------------------------------------------------------------------------- */

const PolicyPanel: React.FC<{
  dryRun: boolean;
  actionLoading: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
}> = ({ dryRun, actionLoading, onToggleDryRun }) => {
  const { t } = useTranslation();
  const [ruleCount, setRuleCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/rules')
      .then((res) => (res.ok ? (res.json() as Promise<RulesResponse>) : null))
      .then((data) => {
        if (!cancelled && data) setRuleCount(data.rules?.length ?? 0);
      })
      .catch(() => {
        // The count is a convenience; the rules screen reports fetch problems.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="dash-panel area-policy">
      <header className="panel-head">
        <h3 className="panel-heading">{t('dashboard.policy_title')}</h3>
        <RemediationToggle
          dryRun={dryRun}
          onToggleDryRun={onToggleDryRun}
          actionLoading={actionLoading}
          appearance="switch"
        />
      </header>

      <div className="policy-state">
        <FontAwesomeIcon
          icon={dryRun ? faShieldHalved : faBolt}
          className={dryRun ? 'policy-icon warn' : 'policy-icon danger'}
        />
        <span className="policy-state-label">
          {dryRun ? t('pulse.policy_dry_run') : t('pulse.policy_active')}
        </span>
      </div>
      <p className="policy-desc">{dryRun ? t('pulse.desc_dry_run') : t('pulse.desc_active')}</p>

      <a className="policy-rules" href={routeHref('automation/rules')}>
        <span>{t('dashboard.policy_rules')}</span>
        <span className="health-count tabular">{ruleCount ?? '—'}</span>
        <FontAwesomeIcon icon={faArrowRight} />
      </a>
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Top consumers                                                               */
/* -------------------------------------------------------------------------- */

const ConsumersPanel: React.FC<{ containers: ContainerCard[] }> = ({ containers }) => {
  const { t, i18n } = useTranslation();
  const [metric, setMetric] = useState<'cpu' | 'mem'>('cpu');

  const value = (c: ContainerCard) =>
    Math.min(100, Math.max(0, metric === 'cpu' ? c.cpu_percent : c.mem_percent));
  const level = metric === 'cpu' ? containerCpuLevel : containerMemLevel;
  const top = [...containers].sort((a, b) => value(b) - value(a)).slice(0, TOP_CONSUMER_COUNT);

  return (
    <section className="dash-panel area-consumers">
      <header className="panel-head">
        <div>
          <h3 className="panel-heading">{t('dashboard.consumers_title')}</h3>
          <p className="panel-sub">{t('dashboard.consumers_sub')}</p>
        </div>
        <div className="mini-segmented" role="group" aria-label={t('dashboard.consumers_metric')}>
          {(['cpu', 'mem'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={metric === m ? 'active' : ''}
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
            >
              {m === 'cpu' ? t('dashboard.metric_cpu') : t('dashboard.metric_mem')}
            </button>
          ))}
        </div>
      </header>

      {top.length === 0 ? (
        <p className="panel-empty">{t('dashboard.consumers_empty')}</p>
      ) : (
        <ol className="consumer-list">
          {top.map((c) => {
            const v = value(c);
            const l = level(v);
            return (
              <li key={c.id} className="consumer-row" title={c.image}>
                <span className="consumer-name">{c.name || c.id.slice(0, 12)}</span>
                <span className="consumer-value tabular">
                  {l !== 'ok' && <FontAwesomeIcon icon={LEVEL_ICON[l]} className={`consumer-flag ${l}`} />}
                  {formatPercent(v, i18n.language)}
                </span>
                <span className="consumer-track">
                  <span className={`consumer-fill ${l}`} style={{ width: `${Math.max(1, v)}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

const EventsPanel: React.FC<{ logs: AuditEntry[]; rangeMs: number; endTime: number }> = ({
  logs,
  rangeMs,
  endTime,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const startTime = endTime - rangeMs;
  const bucketMs = rangeMs / EVENT_BUCKETS;

  const inRange = useMemo(
    () =>
      logs.filter((log) => {
        // No upper bound: an event can arrive between two metric frames and must still show.
        return new Date(log.timestamp).getTime() > startTime;
      }),
    [logs, startTime]
  );

  const buckets = useMemo(() => {
    const counts = new Array<number>(EVENT_BUCKETS).fill(0);
    for (const log of inRange) {
      const index = Math.floor((new Date(log.timestamp).getTime() - startTime) / bucketMs);
      counts[Math.min(EVENT_BUCKETS - 1, Math.max(0, index))] += 1;
    }
    return counts;
  }, [inRange, startTime, bucketMs]);

  const peak = Math.max(1, ...buckets);
  const recent = inRange.slice(0, RECENT_EVENT_COUNT);

  return (
    <section className="dash-panel area-events">
      <header className="panel-head">
        <div>
          <h3 className="panel-heading">{t('dashboard.events_title')}</h3>
          <p className="panel-sub">{t('dashboard.events_sub', { count: inRange.length })}</p>
        </div>
        <PanelLink route="events/all" label={t('dashboard.view_all')} />
      </header>

      <div className="event-histogram" role="img" aria-label={t('dashboard.events_sub', { count: inRange.length })}>
        {buckets.map((count, i) => {
          const from = startTime + i * bucketMs;
          return (
            <span
              key={i}
              className="event-column-hit"
              title={`${formatClock(from, lang)} – ${formatClock(from + bucketMs, lang)}: ${count}`}
            >
              <span
                className={`event-column ${count > 0 ? 'filled' : ''}`}
                style={{ height: count > 0 ? `${Math.max(12, (count / peak) * 100)}%` : undefined }}
              />
            </span>
          );
        })}
      </div>

      {recent.length === 0 ? (
        <p className="panel-empty">{t('dashboard.events_empty')}</p>
      ) : (
        <ul className="event-list">
          {recent.map((log) => {
            const tone = TONE_STYLES[eventTone(log)];
            return (
              <li key={log.id} className="event-row">
                <span className="event-time tabular">{formatTime(log.timestamp, lang)}</span>
                <span className="event-tag" style={{ color: tone.color, background: tone.background }}>
                  {log.rule_name || log.action || log.status}
                </span>
                <span className="event-text" title={log.message}>
                  {log.container_name && <strong>{log.container_name}</strong>} {log.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export const Dashboard: React.FC<DashboardProps> = ({
  system,
  containers,
  auditLogs,
  history,
  dryRun,
  connectionState,
  lastUpdated,
  actionLoading,
  onToggleDryRun,
}) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('15m');
  const rangeMs = RANGES.find((r) => r.id === rangeId)!.ms;

  const hostSeries = useMemo<ChartSeries[]>(
    () => [
      { id: 'cpu', label: t('dashboard.metric_cpu'), color: 'var(--series-1)', values: history.map((s) => s.cpuPercent) },
      { id: 'mem', label: t('dashboard.metric_mem'), color: 'var(--series-2)', values: history.map((s) => s.memPercent) },
    ],
    [history, t]
  );
  const networkSeries = useMemo<ChartSeries[]>(
    () => [
      { id: 'rx', label: t('dashboard.net_rx'), color: 'var(--series-1)', values: history.map((s) => s.netRxRate) },
      { id: 'tx', label: t('dashboard.net_tx'), color: 'var(--series-2)', values: history.map((s) => s.netTxRate) },
    ],
    [history, t]
  );

  const latest = history[history.length - 1];
  const collecting = t('dashboard.chart_collecting');

  return (
    <div className="dashboard-screen">
      <Headline
        system={system}
        containers={containers}
        connectionState={connectionState}
        lastUpdated={lastUpdated}
      />

      <div className="dash-toolbar">
        <span className="dash-toolbar-note">{t('dashboard.history_note')}</span>
        <div className="mini-segmented" role="group" aria-label={t('dashboard.range_label')}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === rangeId ? 'active' : ''}
              aria-pressed={r.id === rangeId}
              onClick={() => setRangeId(r.id)}
            >
              {t(`dashboard.range_${r.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="dash-grid">
        <TrendPanel
          className="area-host"
          title={t('dashboard.host_title')}
          subtitle={t('dashboard.host_sub')}
          ariaLabel={
            latest
              ? t('dashboard.host_aria', {
                  cpu: formatPercent(latest.cpuPercent, lang),
                  mem: formatPercent(latest.memPercent, lang),
                })
              : t('dashboard.host_title')
          }
          samples={history}
          series={hostSeries}
          rangeMs={rangeMs}
          yMax={100}
          formatValue={(v) => formatPercent(v, lang)}
          formatTick={(v) => formatPercent(v, lang, 0)}
          emptyLabel={collecting}
        />

        <HealthPanel containers={containers} />
        <PolicyPanel dryRun={dryRun} actionLoading={actionLoading} onToggleDryRun={onToggleDryRun} />
        <ConsumersPanel containers={containers} />

        <TrendPanel
          className="area-network"
          title={t('dashboard.net_title')}
          subtitle={t('dashboard.net_sub')}
          ariaLabel={t('dashboard.net_title')}
          samples={history}
          series={networkSeries}
          rangeMs={rangeMs}
          minYMax={MIN_RATE_SCALE_BYTES}
          unitBase={1024}
          gutters={{ left: 66, right: 82 }}
          formatValue={formatByteRate}
          formatTick={formatByteRate}
          emptyLabel={containers.length === 0 && lastUpdated ? t('dashboard.net_empty') : collecting}
        />

        <EventsPanel
          logs={auditLogs}
          rangeMs={rangeMs}
          endTime={lastUpdated ? lastUpdated.getTime() : Date.now()}
        />
      </div>
    </div>
  );
};
