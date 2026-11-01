import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClock,
  faShieldHalved,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import { AuditEntry } from '../types';
import { formatTime } from '../i18n';
import { eventTone, EventView, matchesEventView, TONE_STYLES } from '../utils/audit';

interface AuditLogProps {
  logs: AuditEntry[];
  view: EventView;
}

export const AuditLog: React.FC<AuditLogProps> = ({ logs, view }) => {
  const { t, i18n } = useTranslation();
  const filteredLogs = useMemo(() => logs.filter((log) => matchesEventView(log, view)), [logs, view]);

  return (
    <div className="screen-stack">
      <div className="section-header">
        <span className="section-count">{t('audit.count', { count: filteredLogs.length })}</span>
      </div>

      <div className="audit-log-container">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">{t('audit.empty')}</div>
        ) : (
          filteredLogs.map((log) => {
            const timeStr = formatTime(log.timestamp, i18n.language);
            const { color: tagColor, background: tagBg } = TONE_STYLES[eventTone(log)];

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
