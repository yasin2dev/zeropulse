import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faCircleExclamation,
  faTriangleExclamation,
  faNetworkWired,
  faClock,
  faShieldHalved,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import { ConnectionState, RuntimeMode } from '../types';
import { formatTime } from '../i18n';

interface StatusBarProps {
  mode: RuntimeMode;
  connectionState: ConnectionState;
  dryRun: boolean;
  stressIndex: number;
  lastUpdated: Date | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  connectionState,
  dryRun,
  stressIndex,
  lastUpdated,
}) => {
  const { t, i18n } = useTranslation();

  let systemHealthIcon = faCircleCheck;
  let systemHealthText = t('status_bar.nominal');
  let systemHealthClass = 'status-ok';

  if (stressIndex >= 0.7) {
    systemHealthIcon = faCircleExclamation;
    systemHealthText = t('status_bar.critical');
    systemHealthClass = 'status-danger';
  } else if (stressIndex >= 0.3) {
    systemHealthIcon = faTriangleExclamation;
    systemHealthText = t('status_bar.warning');
    systemHealthClass = 'status-warn';
  }

  const connLabel =
    connectionState === 'connected'
      ? t('status_bar.connected')
      : connectionState === 'reconnecting'
      ? t('status_bar.reconnecting')
      : t('status_bar.disconnected');

  return (
    <footer className="appliance-status-bar">
      <div className="status-bar-left">
        <span className={`status-pill sm ${systemHealthClass}`}>
          <FontAwesomeIcon icon={systemHealthIcon} />
          <span>{systemHealthText}</span>
        </span>

        <span className="status-separator">|</span>

        <span className="status-item">
          <FontAwesomeIcon icon={faNetworkWired} style={{ opacity: 0.6 }} />
          <span>
            {t('status_bar.daemon', {
              mode: mode === 'docker' ? t('navbar.docker_engine') : t('navbar.host_native'),
              conn: connLabel,
            })}
          </span>
        </span>

        <span className="status-separator">|</span>

        <span className="status-item">
          <FontAwesomeIcon
            icon={dryRun ? faShieldHalved : faBolt}
            style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
          />
          <span>
            {t('status_bar.policy', {
              policy: dryRun ? t('status_bar.policy_dry_run') : t('status_bar.policy_active'),
            })}
          </span>
        </span>
      </div>

      <div className="status-bar-right">
        {lastUpdated && (
          <span className="status-item tabular">
            <FontAwesomeIcon icon={faClock} style={{ opacity: 0.6 }} />
            <span>{t('status_bar.telemetry', { time: formatTime(lastUpdated, i18n.language) })}</span>
          </span>
        )}

        <span className="status-separator">|</span>

        <span className="status-item version-pill">
          <span>Zeropulse v0.2.0</span>
        </span>
      </div>
    </footer>
  );
};
