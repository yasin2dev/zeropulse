import React, { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faListCheck,
  faClock,
  faShieldHalved,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import { AuditEntry } from '../types';

interface AuditLogProps {
  logs: AuditEntry[];
}

export const AuditLog: React.FC<AuditLogProps> = ({ logs }) => {
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
          <span>Olay ve Kural Denetim Akışı (Audit & Healing Log)</span>
          <span className="section-count">({logs.length} Kayıt)</span>
        </h2>

        <div className="controls-group">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tümü ({logs.length})
          </button>
          <button
            className={`filter-btn ${filter === 'actions' ? 'active' : ''}`}
            onClick={() => setFilter('actions')}
          >
            Aksiyonlar
          </button>
          <button
            className={`filter-btn ${filter === 'anomalies' ? 'active' : ''}`}
            onClick={() => setFilter('anomalies')}
          >
            Anomaliler & Hatalar
          </button>
        </div>
      </div>

      <div className="audit-log-container">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">Henüz kaydedilmiş anomali veya iyileştirme olayı yok.</div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            let tagColor = 'var(--text-secondary)';
            let tagBg = 'var(--bg-card-hover)';
            let tagBorder = 'var(--border-card)';

            if (log.status === 'ACTION_EXECUTED' || log.status === 'MANUAL_RESTART') {
              tagColor = 'var(--status-ok)';
              tagBg = 'var(--status-ok-bg)';
              tagBorder = 'var(--status-ok-border)';
            } else if (log.status === 'TRIGGERED') {
              tagColor = 'var(--status-warn)';
              tagBg = 'var(--status-warn-bg)';
              tagBorder = 'var(--status-warn-border)';
            } else if (log.status === 'FAILED' || log.status === 'REMEDIATION_FAILED') {
              tagColor = 'var(--crimson)';
              tagBg = 'var(--status-danger-bg)';
              tagBorder = 'var(--status-danger-border)';
            }

            return (
              <div key={log.id} className="audit-entry">
                <div className="audit-left">
                  <span className="audit-time">
                    <FontAwesomeIcon icon={faClock} style={{ fontSize: '0.65rem' }} />
                    <span>{timeStr}</span>
                  </span>
                  <span
                    className="audit-tag"
                    style={{ color: tagColor, background: tagBg, border: `1px solid ${tagBorder}` }}
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
                    <span className="badge warning">
                      <FontAwesomeIcon icon={faShieldHalved} />
                      <span>DRY-RUN</span>
                    </span>
                  ) : (
                    <span className="badge critical">
                      <FontAwesomeIcon icon={faBolt} />
                      <span>REMEDIATION</span>
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
