import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';

export const ApiEndpoints: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="api-diagnostic-box">
      <div className="diagnostic-header">
        <FontAwesomeIcon icon={faCircleCheck} style={{ color: 'var(--status-ok)' }} />
        <span>{t('settings.endpoints_title')}</span>
      </div>
      <div className="api-endpoint-list">
        <code>GET  /api/v1/health</code>
        <code>GET  /api/v1/status</code>
        <code>GET  /api/v1/stream (SSE)</code>
        <code>GET  /api/v1/containers</code>
        <code>GET  /api/v1/metrics/history</code>
        <code>GET  /api/v1/rules</code>
        <code>POST /api/v1/rules</code>
        <code>DELETE /api/v1/rules/:name</code>
        <code>POST /api/v1/containers/:id/restart</code>
        <code>PUT  /api/v1/config/dry-run</code>
      </div>
    </div>
  );
};
