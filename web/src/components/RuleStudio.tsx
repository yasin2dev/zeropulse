import React, { useMemo, useState } from 'react';
import { RULE_PRESETS, RulePreset } from '../data/content';
import { Reveal } from './MotionPrimitives';

type TabKind = 'yaml' | 'json' | 'event';

export function RuleStudio() {
  const [activePresetId, setActivePresetId] = useState<string>(RULE_PRESETS[0].id);
  const [rule, setRule] = useState<RulePreset>(RULE_PRESETS[0]);
  const [tab, setTab] = useState<TabKind>('yaml');
  const [copied, setCopied] = useState(false);

  const selectPreset = (preset: RulePreset) => {
    setActivePresetId(preset.id);
    setRule({ ...preset });
  };

  const updateField = <K extends keyof RulePreset>(key: K, value: RulePreset[K]) => {
    setActivePresetId('custom');
    setRule((prev) => ({ ...prev, [key]: value }));
  };

  const yamlOutput = useMemo(() => {
    return `rules:
  - name: "${rule.name || 'custom-rule'}"
    metric_type: "${rule.metric_type}"
    operator: "${rule.operator}"
    threshold: ${rule.threshold}
    consecutive_periods: ${rule.consecutive_periods}
    action: "${rule.action}"
    cooldown_seconds: ${rule.cooldown_seconds}
    container_filter: "${rule.container_filter}"`;
  }, [rule]);

  const jsonOutput = useMemo(() => {
    return JSON.stringify(
      {
        rules: [
          {
            name: rule.name || 'custom-rule',
            metric_type: rule.metric_type,
            operator: rule.operator,
            threshold: Number(rule.threshold),
            consecutive_periods: Number(rule.consecutive_periods),
            action: rule.action,
            cooldown_seconds: Number(rule.cooldown_seconds),
            container_filter: rule.container_filter,
          },
        ],
      },
      null,
      2
    );
  }, [rule]);

  const eventOutput = useMemo(() => {
    const simulatedValue =
      rule.metric_type === 'NET_RX_BYTES' || rule.metric_type === 'NET_TX_BYTES'
        ? Math.round(Number(rule.threshold) * 1.18)
        : Number((Number(rule.threshold) + 6.5).toFixed(1));
    return JSON.stringify(
      {
        timestamp: '2026-10-24T12:00:00.000000000Z',
        event_type: 'anomaly',
        mode: rule.dry_run ? 'dry-run' : 'remediation',
        container_id: 'a3f1b2c4d5e6',
        container_name: rule.container_filter || 'api-server',
        rule_name: rule.name || 'custom-rule',
        metric_type: rule.metric_type,
        current_value: simulatedValue,
        threshold: Number(rule.threshold),
        consecutive_count: Number(rule.consecutive_periods),
        action: rule.action,
        dry_run: rule.dry_run,
      },
      null,
      2
    );
  }, [rule]);

  const cliCommand = useMemo(() => {
    const ext = tab === 'json' ? 'rules.json' : 'rules.yaml';
    return `./zeropulse --config ${ext}${rule.dry_run ? ' --dry-run' : ''} | jq .`;
  }, [tab, rule.dry_run]);

  const displayedCode = tab === 'yaml' ? yamlOutput : tab === 'json' ? jsonOutput : eventOutput;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <Reveal className="zp-studio__shell">
      <div className="zp-studio__controls">
        <div className="zp-studio__presets" role="group" aria-label="Hazır kural şablonları">
          {RULE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="zp-preset"
              data-active={activePresetId === preset.id || undefined}
              onClick={() => selectPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="zp-studio__grid">
          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-rule-name">
              <span>name</span>
              <span>string</span>
            </label>
            <input
              id="zp-rule-name"
              className="zp-field__input"
              type="text"
              value={rule.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-metric-type">
              <span>metric_type</span>
              <span>enum</span>
            </label>
            <select
              id="zp-metric-type"
              className="zp-field__select"
              value={rule.metric_type}
              onChange={(e) =>
                updateField('metric_type', e.target.value as RulePreset['metric_type'])
              }
            >
              <option value="CPU_PERCENT">CPU_PERCENT</option>
              <option value="MEM_PERCENT">MEM_PERCENT</option>
              <option value="CPU_THROTTLED_PERIODS">CPU_THROTTLED_PERIODS</option>
              <option value="NET_RX_BYTES">NET_RX_BYTES</option>
              <option value="NET_TX_BYTES">NET_TX_BYTES</option>
            </select>
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-operator">
              <span>operator</span>
              <span>GT | GTE</span>
            </label>
            <select
              id="zp-operator"
              className="zp-field__select"
              value={rule.operator}
              onChange={(e) => updateField('operator', e.target.value as RulePreset['operator'])}
            >
              <option value="GTE">GTE (&gt;=)</option>
              <option value="GT">GT (&gt;)</option>
            </select>
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-threshold">
              <span>threshold</span>
              <span>float64 &gt;= 0</span>
            </label>
            <input
              id="zp-threshold"
              className="zp-field__input"
              type="number"
              min={0}
              step="any"
              value={rule.threshold}
              onChange={(e) => updateField('threshold', Number(e.target.value))}
            />
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-consecutive">
              <span>consecutive_periods</span>
              <span>int &gt;= 1</span>
            </label>
            <input
              id="zp-consecutive"
              className="zp-field__input"
              type="number"
              min={1}
              max={60}
              value={rule.consecutive_periods}
              onChange={(e) =>
                updateField('consecutive_periods', Math.max(1, Number(e.target.value)))
              }
            />
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-action">
              <span>action</span>
              <span>enum</span>
            </label>
            <select
              id="zp-action"
              className="zp-field__select"
              value={rule.action}
              onChange={(e) => updateField('action', e.target.value as RulePreset['action'])}
            >
              <option value="NOTIFY">NOTIFY</option>
              <option value="RESTART">RESTART</option>
            </select>
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-cooldown">
              <span>cooldown_seconds</span>
              <span>int &gt;= 0</span>
            </label>
            <input
              id="zp-cooldown"
              className="zp-field__input"
              type="number"
              min={0}
              step={10}
              value={rule.cooldown_seconds}
              onChange={(e) =>
                updateField('cooldown_seconds', Math.max(0, Number(e.target.value)))
              }
            />
          </div>

          <div className="zp-field">
            <label className="zp-field__label" htmlFor="zp-container">
              <span>container_filter</span>
              <span>opsiyonel</span>
            </label>
            <input
              id="zp-container"
              className="zp-field__input"
              type="text"
              placeholder="Tüm konteynerler (boş)"
              value={rule.container_filter}
              onChange={(e) => updateField('container_filter', e.target.value)}
            />
          </div>
        </div>

        <div className="zp-toggle-row">
          <div className="zp-toggle-row__info">
            <span className="zp-toggle-row__title">Simülasyon Modu (--dry-run)</span>
            <span className="zp-toggle-row__sub">
              Aksiyonları uygulamadan AnomalyEvent çıktısını stdout’a logla.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={rule.dry_run}
            aria-label="Simülasyon modunu aç veya kapat"
            className="zp-switch"
            onClick={() => updateField('dry_run', !rule.dry_run)}
          >
            <span className="zp-switch__thumb" />
          </button>
        </div>
      </div>

      <div className="zp-terminal">
        <div className="zp-terminal__bar">
          <div className="zp-terminal__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="zp-terminal__tabs" role="tablist" aria-label="Çıktı formatı">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'yaml'}
              className="zp-terminal__tab"
              data-active={tab === 'yaml' || undefined}
              onClick={() => setTab('yaml')}
            >
              rules.yaml
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'json'}
              className="zp-terminal__tab"
              data-active={tab === 'json' || undefined}
              onClick={() => setTab('json')}
            >
              rules.json
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'event'}
              className="zp-terminal__tab"
              data-active={tab === 'event' || undefined}
              onClick={() => setTab('event')}
            >
              AnomalyEvent (stdout)
            </button>
          </div>
          <button type="button" className="zp-terminal__copy" onClick={handleCopy}>
            {copied ? 'Kopyalandı ✓' : 'Kopyala'}
          </button>
        </div>

        <pre className="zp-terminal__body">
          <code>{displayedCode}</code>
        </pre>

        <div className="zp-terminal__cmd">
          <span>CLI:</span>
          <code>{cliCommand}</code>
        </div>
      </div>
    </Reveal>
  );
}
