import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faRotateRight,
  faCircleCheck,
  faTriangleExclamation,
  faCircleExclamation,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { ContainerCard } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { formatBytes } from '../i18n';

export type WorkloadView = 'all' | 'attention' | 'healthy';

interface ContainerGridProps {
  view: WorkloadView;
  containers: ContainerCard[];
  onRestartContainer: (id: string) => Promise<{ success: boolean; message?: string }>;
  actionLoading: boolean;
}

export const ContainerGrid: React.FC<ContainerGridProps> = ({
  view,
  containers,
  onRestartContainer,
  actionLoading,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedForRestart, setSelectedForRestart] = useState<ContainerCard | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.image.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (view === 'attention') {
        return c.health_status === 'warning' || c.health_status === 'critical';
      }
      if (view === 'healthy') {
        return c.health_status === 'ok' || c.health_status === 'cooldown';
      }
      return true;
    });
  }, [containers, search, view]);

  const handleConfirmRestart = async () => {
    if (!selectedForRestart) return;
    const target = selectedForRestart;
    const res = await onRestartContainer(target.id);
    setSelectedForRestart(null);

    if (res.success) {
      setFeedbackMsg({
        text: t('containers.toast_success', { name: target.name }),
        isError: false,
      });
    } else {
      setFeedbackMsg({
        text: t('containers.toast_failed', { message: res.message || '' }),
        isError: true,
      });
    }

    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  return (
    <div className="screen-stack">
      <div className="section-header">
        <span className="section-count">{t('containers.total_count', { count: filteredContainers.length })}</span>

        <div className="controls-group">
          <div className="search-wrapper">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={t('containers.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            fontWeight: 600,
            background: feedbackMsg.isError ? 'var(--status-danger-bg)' : 'var(--status-ok-bg)',
            border: `1px solid ${feedbackMsg.isError ? 'var(--status-danger-border)' : 'var(--status-ok-border)'}`,
            color: feedbackMsg.isError ? 'var(--crimson)' : 'var(--status-ok)',
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('containers.th_name')}</th>
              <th>{t('containers.th_cpu')}</th>
              <th>{t('containers.th_mem')}</th>
              <th>{t('containers.th_throttling')}</th>
              <th>{t('containers.th_network')}</th>
              <th>{t('containers.th_status')}</th>
              <th>{t('containers.th_action')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredContainers.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  {t('containers.empty')}
                </td>
              </tr>
            ) : (
              filteredContainers.map((c) => {
                const cpuVal = Math.min(100, Math.max(0, c.cpu_percent));
                const memVal = Math.min(100, Math.max(0, c.mem_percent));

                let cpuClass = 'status-ok';
                if (cpuVal > 80) cpuClass = 'status-danger';
                else if (cpuVal > 60) cpuClass = 'status-warn';

                let memClass = 'status-ok';
                if (memVal > 85) memClass = 'status-danger';
                else if (memVal > 70) memClass = 'status-warn';

                const shortId = c.id.length > 12 ? c.id.substring(0, 12) : c.id;
                const throttledMs = (c.cpu_throttled_time_ns / 1_000_000).toFixed(0);

                let statusIcon = faCircleCheck;
                let statusLabel = t('containers.status_ok');
                if (c.health_status === 'warning') {
                  statusIcon = faTriangleExclamation;
                  statusLabel = t('containers.status_warning');
                } else if (c.health_status === 'critical') {
                  statusIcon = faCircleExclamation;
                  statusLabel = t('containers.status_critical');
                } else if (c.health_status === 'cooldown') {
                  statusIcon = faClock;
                  statusLabel = t('containers.status_cooldown');
                }

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="container-name-cell">
                        <span className="container-name">{c.name || shortId}</span>
                        <span className="container-meta">
                          {shortId} &bull; {c.image}
                        </span>
                      </div>
                    </td>

                    <td className="usage-bar-cell">
                      <div className="usage-text">
                        <span style={{ color: `var(--${cpuClass})` }}>{cpuVal.toFixed(1)}%</span>
                      </div>
                      <div className="progress-track sm">
                        <div
                          className={`progress-fill ${cpuClass}`}
                          style={{ width: `${Math.min(100, Math.max(2, cpuVal))}%` }}
                        />
                      </div>
                    </td>

                    <td className="usage-bar-cell">
                      <div className="usage-text">
                        <span style={{ color: `var(--${memClass})` }}>{memVal.toFixed(1)}%</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {formatBytes(c.mem_usage_bytes)}
                          {c.mem_limit_bytes > 0 && ` / ${formatBytes(c.mem_limit_bytes)}`}
                        </span>
                      </div>
                      <div className="progress-track sm">
                        <div
                          className={`progress-fill ${memClass}`}
                          style={{ width: `${Math.min(100, Math.max(2, memVal))}%` }}
                        />
                      </div>
                    </td>

                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {c.cpu_throttled_periods > 0 ? (
                          <span style={{ color: 'var(--status-warn)' }}>
                            {t('containers.periods_count', {
                              count: c.cpu_throttled_periods,
                              ms: throttledMs,
                            })}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>
                            {t('containers.periods_zero')}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="net-cell">
                      <span>↓ {formatBytes(c.net_rx_bytes)}</span>
                      <span>↑ {formatBytes(c.net_tx_bytes)}</span>
                    </td>

                    <td>
                      <span className={`status-pill sm ${c.health_status === 'ok' ? 'status-ok' : c.health_status === 'warning' ? 'status-warn' : c.health_status === 'critical' ? 'status-danger' : 'status-neutral'}`}>
                        <FontAwesomeIcon icon={statusIcon} />
                        <span>{statusLabel}</span>
                      </span>
                    </td>

                    <td>
                      <button
                        className="btn-action-sm"
                        onClick={() => setSelectedForRestart(c)}
                        disabled={actionLoading}
                        title={t('containers.restart_title')}
                      >
                        <FontAwesomeIcon icon={faRotateRight} />
                        <span>{t('containers.restart_btn')}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={Boolean(selectedForRestart)}
        title={t('containers.modal_title')}
        message={t('containers.modal_message', {
          name: selectedForRestart?.name,
          id: selectedForRestart?.id.slice(0, 12),
        })}
        confirmLabel={t('containers.modal_confirm')}
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirmRestart}
        onCancel={() => setSelectedForRestart(null)}
      />
    </div>
  );
};
