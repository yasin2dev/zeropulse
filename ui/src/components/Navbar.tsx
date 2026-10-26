import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGaugeHigh,
  faCube,
  faListCheck,
  faGear,
  faUsers,
  faSun,
  faMoon,
  faServer,
  faShieldHalved,
  faBolt,
  faRotateRight,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import { BrandLogo } from './BrandLogo';
import { ConnectionState, RuntimeMode } from '../types';

export type ActiveTab = 'dashboard' | 'workloads' | 'audit' | 'settings' | 'users';

interface NavbarProps {
  mode: RuntimeMode;
  connectionState: ConnectionState;
  dryRun: boolean;
  totalContainers: number;
  unhealthyCount: number;
  totalLogs: number;
  theme: 'dark' | 'light';
  activeTab: ActiveTab;
  currentUser: { username: string; role: string } | null;
  onTabChange: (tab: ActiveTab) => void;
  onToggleTheme: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  actionLoading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  connectionState,
  dryRun,
  totalContainers,
  unhealthyCount,
  totalLogs,
  theme,
  activeTab,
  currentUser,
  onTabChange,
  onToggleTheme,
  onRefresh,
  onLogout,
  actionLoading,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <header className="appliance-header">
      {/* Top Industrial Command Bar */}
      <div className="command-bar">
        {/* Brand with Official Favicon Logo */}
        <div className="brand-group">
          <BrandLogo size={36} />
          <div className="brand-text-block">
            <div className="brand-title-row">
              <span className="brand-name">ZEROPULSE</span>
              <span className="brand-edition">APPLIANCE</span>
            </div>
            <span className="brand-subline">Edge Telemetry & Self-Healing Gateway</span>
          </div>
        </div>

        {/* System Telemetry Badges */}
        <div className="system-telemetry-strip">
          <div className="telemetry-pill">
            <FontAwesomeIcon icon={faServer} className="pill-icon" />
            <span className="pill-key">DAEMON:</span>
            <span className="pill-val">{mode === 'docker' ? 'DOCKER ENGINE' : 'HOST NATIVE'}</span>
          </div>

          <div className="telemetry-pill">
            <FontAwesomeIcon
              icon={dryRun ? faShieldHalved : faBolt}
              style={{ color: dryRun ? 'var(--status-warn)' : 'var(--crimson)' }}
            />
            <span className="pill-key">GUARD:</span>
            <span
              className="pill-val"
              style={{ color: dryRun ? 'var(--status-warn)' : 'var(--crimson)' }}
            >
              {dryRun ? 'DRY-RUN' : 'REMEDIATION'}
            </span>
          </div>

          <div className="telemetry-pill">
            <span
              className={`status-indicator-dot ${
                connectionState === 'connected'
                  ? 'live'
                  : connectionState === 'reconnecting'
                  ? 'warn'
                  : 'offline'
              }`}
            />
            <span className="pill-key">STREAM:</span>
            <span className="pill-val">
              {connectionState === 'connected'
                ? 'ONLINE (5s)'
                : connectionState === 'reconnecting'
                ? 'RECONNECTING'
                : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Appliance System Utilities (Segmented Theme Control, Refresh & User/Logout) */}
        <div className="appliance-utilities">
          <button
            type="button"
            className="util-btn"
            onClick={onRefresh}
            disabled={actionLoading}
            title="Telemetriyi anında yenile"
          >
            <FontAwesomeIcon icon={faRotateRight} spin={actionLoading} />
          </button>

          {/* Integrated Theme Mode Switcher */}
          <div className="theme-segmented-control" title="Açık / Koyu Tema Seçici">
            <button
              type="button"
              className={`theme-segment ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => theme !== 'dark' && onToggleTheme()}
              aria-label="Koyu Tema"
            >
              <FontAwesomeIcon icon={faMoon} />
            </button>
            <button
              type="button"
              className={`theme-segment ${theme === 'light' ? 'active' : ''}`}
              onClick={() => theme !== 'light' && onToggleTheme()}
              aria-label="Açık Tema"
            >
              <FontAwesomeIcon icon={faSun} />
            </button>
          </div>

          {currentUser && (
            <div className="operator-badge">
              <span className="operator-role">{currentUser.role.toUpperCase()}</span>
              <span className="operator-name">{currentUser.username}</span>
            </div>
          )}

          <button
            type="button"
            className="util-btn"
            onClick={onLogout}
            title="Oturumu Kapat"
            style={{ color: 'var(--text-secondary)' }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>
      </div>

      {/* Sub-Nav Management Tabs (Firewall/Appliance Navigation) */}
      <nav className="appliance-tabs-bar">
        <button
          type="button"
          className={`tab-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
        >
          <FontAwesomeIcon icon={faGaugeHigh} className="tab-icon" />
          <span>Genel Bakış (Overview)</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'workloads' ? 'active' : ''}`}
          onClick={() => onTabChange('workloads')}
        >
          <FontAwesomeIcon icon={faCube} className="tab-icon" />
          <span>İş Yükleri & Konteynerler</span>
          <span className="tab-counter">{totalContainers}</span>
          {unhealthyCount > 0 && <span className="tab-alert-dot" />}
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => onTabChange('audit')}
        >
          <FontAwesomeIcon icon={faListCheck} className="tab-icon" />
          <span>Olay & İyileştirme Günlüğü</span>
          <span className="tab-counter">{totalLogs}</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <FontAwesomeIcon icon={faGear} className="tab-icon" />
          <span>Kural & Eşik Yapılandırması</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`tab-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => onTabChange('users')}
          >
            <FontAwesomeIcon icon={faUsers} className="tab-icon" />
            <span>Kullanıcı Yönetimi</span>
          </button>
        )}
      </nav>
    </header>
  );
};
