import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faTrash,
  faRotateRight,
  faXmark,
  faFilter,
  faFileLines,
  faCircleExclamation,
  faCheck,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../ConfirmationModal';
import { CustomRule, MetricType, RuleOperator, RuleAction, RulesResponse } from '../../types';

interface CustomRulesProps {
  currentUser?: { username: string; role: string } | null;
}

export const CustomRules: React.FC<CustomRulesProps> = ({ currentUser }) => {
  const { t } = useTranslation();

  // Dynamic Rules State
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [configPath, setConfigPath] = useState<string>('');
  const [rulesLoading, setRulesLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  // Create Rule Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('CPU_PERCENT');
  const [operator, setOperator] = useState<RuleOperator>('GT');
  const [threshold, setThreshold] = useState<string>('80');
  const [consecutivePeriods, setConsecutivePeriods] = useState<string>('3');
  const [action, setAction] = useState<RuleAction>('NOTIFY');
  const [cooldownSeconds, setCooldownSeconds] = useState<string>('60');
  const [containerFilter, setContainerFilter] = useState('');

  // Delete Rule State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const isAdmin = !currentUser || currentUser.role === 'admin';

  const fetchRules = useCallback(async () => {
    try {
      setRulesLoading(true);
      const res = await fetch('/api/v1/rules');
      if (res.ok) {
        const data: RulesResponse = await res.json();
        setRules(data.rules || []);
        setConfigPath(data.config_path || '');
      }
    } catch {
      // ignore
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleOpenCreateModal = () => {
    setRuleName('');
    setMetricType('CPU_PERCENT');
    setOperator('GT');
    setThreshold('80');
    setConsecutivePeriods('3');
    setAction('NOTIFY');
    setCooldownSeconds('60');
    setContainerFilter('');
    setCreateModalOpen(true);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const threshNum = parseFloat(threshold);
    const periodsNum = parseInt(consecutivePeriods, 10);
    const cooldownNum = parseInt(cooldownSeconds, 10);

    if (!ruleName.trim()) {
      setFeedback({ text: t('settings.val_name_required'), isError: true });
      return;
    }
    if (isNaN(threshNum) || threshNum < 0) {
      setFeedback({ text: t('settings.val_threshold_invalid'), isError: true });
      return;
    }
    if (isNaN(periodsNum) || periodsNum < 1) {
      setFeedback({ text: t('settings.val_periods_invalid'), isError: true });
      return;
    }
    if (isNaN(cooldownNum) || cooldownNum < 0) {
      setFeedback({ text: t('settings.val_cooldown_invalid'), isError: true });
      return;
    }

    const newRule: CustomRule = {
      name: ruleName.trim(),
      metric_type: metricType,
      operator: operator,
      threshold: threshNum,
      consecutive_periods: periodsNum,
      action: action,
      cooldown_seconds: cooldownNum,
      container_filter: containerFilter.trim(),
    };

    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/v1/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (res.ok) {
        setFeedback({
          text: t('settings.toast_create_success', { name: newRule.name }),
          isError: false,
        });
        setCreateModalOpen(false);
        fetchRules();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ text: errData.error || t('settings.toast_create_failed'), isError: true });
      }
    } catch (err: unknown) {
      setFeedback({
        text: t('common.network_error', { error: (err as Error).message }),
        isError: true,
      });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/rules/${encodeURIComponent(deleteTarget)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setFeedback({
          text: t('settings.toast_delete_success', { name: deleteTarget }),
          isError: false,
        });
        setDeleteTarget(null);
        fetchRules();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ text: errData.error || t('settings.toast_delete_failed'), isError: true });
      }
    } catch (err: unknown) {
      setFeedback({
        text: t('common.network_error', { error: (err as Error).message }),
        isError: true,
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const formatMetricLabel = (m: MetricType) => {
    switch (m) {
      case 'CPU_PERCENT':
        return t('settings.metric_cpu');
      case 'MEM_PERCENT':
        return t('settings.metric_mem');
      case 'CPU_THROTTLED_PERIODS':
        return t('settings.metric_cfs');
      case 'NET_RX_BYTES':
        return t('settings.metric_rx');
      case 'NET_TX_BYTES':
        return t('settings.metric_tx');
      default:
        return m;
    }
  };

  return (
    <div className="screen-stack">
      {feedback && (
        <div className={`feedback-banner ${feedback.isError ? 'error' : 'success'}`}>
          <FontAwesomeIcon icon={feedback.isError ? faCircleExclamation : faCheck} />
          <span>{feedback.text}</span>
          <button type="button" className="close-btn" onClick={() => setFeedback(null)} aria-label={t('common.close')}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      <div className="section-header">
        <span className="section-count">{t('settings.active_rules_pill', { count: rules.length })}</span>

        <div className="controls-group">
          {configPath && (
          <span className="config-path" title={configPath}>
            <FontAwesomeIcon icon={faFileLines} />
            <span>{configPath}</span>
          </span>
          )}
          <button
            type="button"
            className="btn-secondary sm"
            onClick={fetchRules}
            disabled={rulesLoading}
            title={t('settings.refresh_title')}
          >
            <FontAwesomeIcon icon={faRotateRight} spin={rulesLoading} />
            <span>{t('settings.refresh_btn')}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className="btn-primary sm"
              onClick={handleOpenCreateModal}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>{t('settings.create_btn')}</span>
            </button>
          )}
        </div>
      </div>

      {rulesLoading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
          {t('settings.loading_rules')}
        </div>
      ) : rules.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px dashed var(--line)',
            borderRadius: 'var(--r-md)',
            padding: '2.5rem',
            textAlign: 'center',
          }}
        >
          <FontAwesomeIcon icon={faSliders} style={{ fontSize: '2rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('settings.no_rules_title')}</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '500px', margin: '0 auto 1.25rem' }}>
            {t('settings.no_rules_desc')}
          </p>
          {isAdmin && (
            <button type="button" className="btn-primary sm" onClick={handleOpenCreateModal}>
              <FontAwesomeIcon icon={faPlus} />
              <span>{t('settings.first_rule_btn')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('settings.th_name')}</th>
                <th>{t('settings.th_metric')}</th>
                <th>{t('settings.th_condition')}</th>
                <th>{t('settings.th_duration')}</th>
                <th>{t('settings.th_action')}</th>
                <th>{t('settings.th_cooldown')}</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>{t('settings.th_ops')}</th>}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.name}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                      {r.container_filter ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FontAwesomeIcon icon={faFilter} style={{ fontSize: '0.7rem' }} />
                          {t('settings.filter_prefix', { filter: r.container_filter })}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {t('settings.all_containers')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="status-pill sm" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--line)' }}>
                      {formatMetricLabel(r.metric_type)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {r.operator === 'GT' ? '>' : '>='} {r.threshold}
                      {r.metric_type === 'CPU_PERCENT' || r.metric_type === 'MEM_PERCENT' ? '%' : ''}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem' }}>
                      {t('settings.periods_format', {
                        periods: r.consecutive_periods,
                        seconds: r.consecutive_periods * 5,
                      })}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-pill sm ${
                        r.action === 'RESTART'
                          ? 'status-danger'
                          : r.action === 'SCALE'
                          ? 'status-warn'
                          : 'status-ok'
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {r.cooldown_seconds}s
                    </span>
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-secondary sm"
                        style={{ color: 'var(--status-danger-fg)' }}
                        onClick={() => setDeleteTarget(r.name)}
                        title={t('settings.delete_rule_title')}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal for Rule Deletion */}
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        title={t('settings.modal_delete_title')}
        message={t('settings.modal_delete_msg', { name: deleteTarget || '' })}
        confirmLabel={t('settings.modal_delete_confirm')}
        isDanger={true}
        isLoading={deleteSubmitting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create Rule Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{t('settings.modal_create_title')}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setCreateModalOpen(false)}
                aria-label={t('common.close')}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreateRule}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">{t('settings.form_rule_name')}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('settings.form_rule_name_ph')}
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    required
                  />
                  <span className="form-helper">{t('settings.form_rule_name_help')}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('settings.form_metric')}</label>
                    <select
                      className="form-select"
                      value={metricType}
                      onChange={(e) => setMetricType(e.target.value as MetricType)}
                    >
                      <option value="CPU_PERCENT">{t('settings.metric_cpu')}</option>
                      <option value="MEM_PERCENT">{t('settings.metric_mem')}</option>
                      <option value="CPU_THROTTLED_PERIODS">{t('settings.metric_cfs')}</option>
                      <option value="NET_RX_BYTES">{t('settings.metric_rx')}</option>
                      <option value="NET_TX_BYTES">{t('settings.metric_tx')}</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('settings.form_operator')}</label>
                    <select
                      className="form-select"
                      value={operator}
                      onChange={(e) => setOperator(e.target.value as RuleOperator)}
                    >
                      <option value="GT">{t('settings.op_gt')}</option>
                      <option value="GTE">{t('settings.op_gte')}</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('settings.form_threshold')}</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-input"
                      placeholder={t('settings.form_threshold_ph')}
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      required
                    />
                    <span className="form-helper">{t('settings.form_threshold_help')}</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('settings.form_periods')}</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      placeholder="3"
                      value={consecutivePeriods}
                      onChange={(e) => setConsecutivePeriods(e.target.value)}
                      required
                    />
                    <span className="form-helper">
                      {t('settings.form_periods_help', {
                        seconds: parseInt(consecutivePeriods || '1', 10) * 5,
                      })}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('settings.form_action')}</label>
                    <select
                      className="form-select"
                      value={action}
                      onChange={(e) => setAction(e.target.value as RuleAction)}
                    >
                      <option value="RESTART">{t('settings.action_restart')}</option>
                      <option value="NOTIFY">{t('settings.action_notify')}</option>
                      <option value="SCALE">{t('settings.action_scale')}</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('settings.form_cooldown')}</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder="60"
                      value={cooldownSeconds}
                      onChange={(e) => setCooldownSeconds(e.target.value)}
                      required
                    />
                    <span className="form-helper">{t('settings.form_cooldown_help')}</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('settings.form_filter')}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('settings.form_filter_ph')}
                    value={containerFilter}
                    onChange={(e) => setContainerFilter(e.target.value)}
                  />
                  <span className="form-helper">{t('settings.form_filter_help')}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createSubmitting}
                >
                  {t('settings.form_cancel')}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? t('settings.form_submitting') : t('settings.form_submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
