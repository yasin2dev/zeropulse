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
  let systemHealthText = 'SİSTEM DURUMU: NORMAL';
  let systemHealthColor = 'var(--status-ok)';

  if (stressIndex >= 0.7) {
    systemHealthIcon = faCircleExclamation;
    systemHealthText = 'SİSTEM DURUMU: KRİTİK YÜK';
    systemHealthColor = 'var(--crimson)';
  } else if (stressIndex >= 0.3) {
    systemHealthIcon = faTriangleExclamation;
    systemHealthText = 'SİSTEM DURUMU: DİKKAT';
    systemHealthColor = 'var(--status-warn)';
  }

  return (
    <footer className="appliance-status-bar">
      <div className="status-bar-left">
        <span className="status-item" style={{ color: systemHealthColor }}>
          <FontAwesomeIcon icon={systemHealthIcon} />
          <span>{systemHealthText}</span>
        </span>

        <span className="status-separator">|</span>

        <span className="status-item">
          <FontAwesomeIcon icon={faNetworkWired} style={{ opacity: 0.7 }} />
          <span>DAEMON: {mode.toUpperCase()} ({connectionState.toUpperCase()})</span>
        </span>

        <span className="status-separator">|</span>

        <span className="status-item">
          <FontAwesomeIcon
            icon={dryRun ? faShieldHalved : faBolt}
            style={{ color: dryRun ? 'var(--status-warn)' : 'var(--crimson)' }}
          />
          <span>POLİTİKA: {dryRun ? 'GÖZLEMLEME (DRY-RUN)' : 'AKTİF REMEDIATION'}</span>
        </span>
      </div>

      <div className="status-bar-right">
        {lastUpdated && (
          <span className="status-item" style={{ opacity: 0.75 }}>
            <FontAwesomeIcon icon={faClock} style={{ fontSize: '0.7rem' }} />
            <span>TELEMETRİ SENKRON: {lastUpdated.toLocaleTimeString()}</span>
          </span>
        )}

        <span className="status-separator">|</span>

        <span className="status-item version-pill">
          <span>ZEROPULSE APPLIANCE v0.2.0</span>
        </span>
      </div>
    </footer>
  );
};
