import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const isAdmin = currentUser?.role === 'admin';
  const currentLang = i18n.language?.startsWith('tr') ? 'tr' : 'en';

  return (
    <header className="appliance-header">
      {/* Top Industrial Command Bar */}
      <div className="command-bar">
        {/* Brand with Official Favicon Logo */}
        <div className="brand-group">
          <BrandLogo size={36} />
          <div className="brand-text-block">
            <div className="brand-title-row">
              <span className="brand-name">Zeropulse</span>
            </div>
          </div>
        </div>

        {/* System Telemetry Badges */}
        <div className="system-telemetry-strip">
          <div className="telemetry-pill">
            <FontAwesomeIcon icon={faServer} className="pill-icon" />
            <span className="pill-key">{t('navbar.daemon')}</span>
            <span className="pill-val">
              {mode === 'docker' ? t('navbar.docker_engine') : t('navbar.host_native')}
            </span>
          </div>

          <div className="telemetry-pill">
            <FontAwesomeIcon
              icon={dryRun ? faShieldHalved : faBolt}
              style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
            />
            <span className="pill-key">{t('navbar.protection')}</span>
            <span
              className="pill-val"
              style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
            >
              {dryRun ? t('navbar.dry_run') : t('navbar.self_healing')}
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
            <span className="pill-key">{t('navbar.stream')}</span>
            <span className="pill-val">
              {connectionState === 'connected'
                ? t('navbar.stream_live')
                : connectionState === 'reconnecting'
                ? t('navbar.stream_reconnecting')
                : t('navbar.stream_offline')}
            </span>
          </div>
        </div>

        {/* Appliance System Utilities (Segmented Theme Control, Language Switcher, Refresh & User/Logout) */}
        <div className="appliance-utilities">
          <button
            type="button"
            className="util-btn"
            onClick={onRefresh}
            disabled={actionLoading}
            title={t('navbar.refresh_telemetry')}
          >
            <FontAwesomeIcon icon={faRotateRight} spin={actionLoading} />
          </button>

          {/* Integrated Language Switcher */}
          <div className="lang-segmented-control" role="group" aria-label={t('navbar.language_selector')}>
            <button
              type="button"
              className={`lang-segment ${currentLang === 'en' ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage('en')}
              aria-label={t('navbar.english')}
              title={t('navbar.english')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-segment ${currentLang === 'tr' ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage('tr')}
              aria-label={t('navbar.turkish')}
              title={t('navbar.turkish')}
            >
              TR
            </button>
          </div>

          {/* Integrated Theme Mode Switcher */}
          <div className="theme-segmented-control" title={t('navbar.theme_selector')}>
            <button
              type="button"
              className={`theme-segment ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => theme !== 'dark' && onToggleTheme()}
              aria-label={t('navbar.theme_dark')}
            >
              <FontAwesomeIcon icon={faMoon} />
            </button>
            <button
              type="button"
              className={`theme-segment ${theme === 'light' ? 'active' : ''}`}
              onClick={() => theme !== 'light' && onToggleTheme()}
              aria-label={t('navbar.theme_light')}
            >
              <FontAwesomeIcon icon={faSun} />
            </button>
          </div>

          {currentUser && (
            <div className="operator-badge">
              <span className="operator-role">
                {currentUser.role === 'admin' ? t('navbar.role_admin') : t('navbar.role_viewer')}
              </span>
              <span className="operator-name">{currentUser.username}</span>
            </div>
          )}

          <button
            type="button"
            className="util-btn"
            onClick={onLogout}
            title={t('navbar.logout')}
            style={{ color: 'var(--text-muted)' }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>
      </div>

      {/* Sub-Nav Management Tabs (Soft Rounded Pill Navigation - Section 5 & 8) */}
      <nav className="appliance-tabs-bar">
        <button
          type="button"
          className={`tab-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
        >
          <FontAwesomeIcon icon={faGaugeHigh} className="tab-icon" />
          <span>{t('navbar.tabs.dashboard')}</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'workloads' ? 'active' : ''}`}
          onClick={() => onTabChange('workloads')}
        >
          <FontAwesomeIcon icon={faCube} className="tab-icon" />
          <span>{t('navbar.tabs.workloads')}</span>
          <span className="tab-counter">{totalContainers}</span>
          {unhealthyCount > 0 && <span className="tab-alert-dot" />}
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => onTabChange('audit')}
        >
          <FontAwesomeIcon icon={faListCheck} className="tab-icon" />
          <span>{t('navbar.tabs.audit')}</span>
          <span className="tab-counter">{totalLogs}</span>
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <FontAwesomeIcon icon={faGear} className="tab-icon" />
          <span>{t('navbar.tabs.settings')}</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`tab-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => onTabChange('users')}
          >
            <FontAwesomeIcon icon={faUsers} className="tab-icon" />
            <span>{t('navbar.tabs.users')}</span>
          </button>
        )}
      </nav>
    </header>
  );
};
