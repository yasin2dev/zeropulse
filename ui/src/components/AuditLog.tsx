import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faListCheck,
  faClock,
  faShieldHalved,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import { AuditEntry } from '../types';
import { formatTime } from '../i18n';

interface AuditLogProps {
  logs: AuditEntry[];
}

export const AuditLog: React.FC<AuditLogProps> = ({ logs }) => {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'actions' | 'anomalies'>('all');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filter === 'actions') {
        return (
          log.action === 'RESTART' ||
          log.action === 'RESTART_SUGGESTED' ||
          log.status === 'ACTION_EXECUTED' ||
          log.status === 'MANUAL_RESTART'
        );
      }
      if (filter === 'anomalies') {
        return (
          log.status === 'TRIGGERED' ||
          log.status === 'DRY_RUN_SKIPPED' ||
          log.status === 'FAILED' ||
          log.status === 'REMEDIATION_FAILED'
        );
      }
      return true;
    });
  }, [logs, filter]);

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <FontAwesomeIcon icon={faListCheck} style={{ opacity: 0.8 }} />
          <span>{t('audit.title')}</span>
          <span className="section-count">{t('audit.count', { count: logs.length })}</span>
        </h2>

        <div className="controls-group">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('audit.filter_all', { count: logs.length })}
          </button>
          <button
            className={`filter-btn ${filter === 'actions' ? 'active' : ''}`}
            onClick={() => setFilter('actions')}
          >
            {t('audit.filter_actions')}
          </button>
          <button
            className={`filter-btn ${filter === 'anomalies' ? 'active' : ''}`}
            onClick={() => setFilter('anomalies')}
          >
            {t('audit.filter_anomalies')}
          </button>
        </div>
      </div>

      <div className="audit-log-container">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">{t('audit.empty')}</div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = formatTime(log.timestamp, i18n.language);
            let tagColor = 'var(--text-muted)';
            let tagBg = 'var(--surface-2)';

            if (log.status === 'ACTION_EXECUTED' || log.status === 'MANUAL_RESTART') {
              tagColor = 'var(--status-ok-fg)';
              tagBg = 'var(--status-ok-bg)';
            } else if (log.status === 'TRIGGERED' || log.status === 'DRY_RUN_SKIPPED') {
              tagColor = 'var(--status-warn-fg)';
              tagBg = 'var(--status-warn-bg)';
            } else if (log.status === 'FAILED' || log.status === 'REMEDIATION_FAILED') {
              tagColor = 'var(--status-danger-fg)';
              tagBg = 'var(--status-danger-bg)';
            }

            return (
              <div key={log.id} className="audit-entry">
                <div className="audit-left">
                  <span className="audit-time">
                    <FontAwesomeIcon icon={faClock} style={{ opacity: 0.6 }} />
                    <span>{timeStr}</span>
                  </span>
                  <span
                    className="audit-tag"
                    style={{ color: tagColor, background: tagBg }}
                  >
                    {log.rule_name || log.action || log.status}
                  </span>
                  {log.container_name && (
                    <span className="audit-target">{log.container_name}</span>
                  )}
                  <span className="audit-msg">{log.message}</span>
                </div>

                <div>
                  {log.dry_run ? (
                    <span className="status-pill sm status-warn">
                      <FontAwesomeIcon icon={faShieldHalved} />
                      <span>{t('audit.badge_dry_run')}</span>
                    </span>
                  ) : (
                    <span className="status-pill sm status-danger">
                      <FontAwesomeIcon icon={faBolt} />
                      <span>{t('audit.badge_remediation')}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
