import React from 'react';
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
  let systemHealthIcon = faCircleCheck;
  let systemHealthText = 'Sistem Durumu: Kararlı';
  let systemHealthClass = 'status-ok';

  if (stressIndex >= 0.7) {
    systemHealthIcon = faCircleExclamation;
    systemHealthText = 'Sistem Durumu: Kritik Yük Altında';
    systemHealthClass = 'status-danger';
  } else if (stressIndex >= 0.3) {
    systemHealthIcon = faTriangleExclamation;
    systemHealthText = 'Sistem Durumu: Dikkat';
    systemHealthClass = 'status-warn';
  }

  const connLabel =
    connectionState === 'connected'
      ? 'Bağlı'
      : connectionState === 'reconnecting'
      ? 'Yeniden Bağlanıyor'
      : 'Bağlantı Kesildi';

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
          <span>Daemon: {mode === 'docker' ? 'Docker Engine' : 'Host Native'} ({connLabel})</span>
        </span>

        <span className="status-separator">|</span>

        <span className="status-item">
          <FontAwesomeIcon
            icon={dryRun ? faShieldHalved : faBolt}
            style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
          />
          <span>Politika: {dryRun ? 'Gözlem Modu (Dry-Run)' : 'Aktif Self-Healing'}</span>
        </span>
      </div>

      <div className="status-bar-right">
        {lastUpdated && (
          <span className="status-item tabular">
            <FontAwesomeIcon icon={faClock} style={{ opacity: 0.6 }} />
            <span>Telemetri: {lastUpdated.toLocaleTimeString('tr-TR')}</span>
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
