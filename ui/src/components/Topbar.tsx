import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faMoon, faRotateRight, faSun } from '@fortawesome/free-solid-svg-icons';
import { ConnectionState } from '../types';
import { findGroupOf, findLeafOf, RouteId } from '../navigation';

interface TopbarProps {
  route: RouteId;
  connectionState: ConnectionState;
  theme: 'dark' | 'light';
  actionLoading: boolean;
  onOpenDrawer: () => void;
  onToggleTheme: () => void;
  onRefresh: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  route,
  connectionState,
  theme,
  actionLoading,
  onOpenDrawer,
  onToggleTheme,
  onRefresh,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('tr') ? 'tr' : 'en';
  const group = findGroupOf(route);
  const leaf = findLeafOf(route);

  const streamClass =
    connectionState === 'connected' ? 'live' : connectionState === 'reconnecting' ? 'warn' : 'offline';
  const streamLabel =
    connectionState === 'connected'
      ? t('navbar.stream_live')
      : connectionState === 'reconnecting'
      ? t('navbar.stream_reconnecting')
      : t('navbar.stream_offline');

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="util-btn topbar-menu-btn"
        onClick={onOpenDrawer}
        aria-label={t('nav.open_menu')}
      >
        <FontAwesomeIcon icon={faBars} />
      </button>

      <div className="topbar-title">
        {leaf && group && (
          <>
            <span className="topbar-crumb">{t(group.labelKey)}</span>
            <span className="topbar-crumb-sep" aria-hidden="true">/</span>
          </>
        )}
        <h1 className="topbar-heading">{t((leaf ?? group)?.labelKey ?? 'nav.dashboard')}</h1>
      </div>

      <div className="topbar-actions">
        <div className="topbar-stream" role="status">
          <span className={`status-indicator-dot ${streamClass}`} />
          <span>{streamLabel}</span>
        </div>

        <button
          type="button"
          className="util-btn"
          onClick={onRefresh}
          disabled={actionLoading}
          title={t('navbar.refresh_telemetry')}
          aria-label={t('navbar.refresh_telemetry')}
        >
          <FontAwesomeIcon icon={faRotateRight} spin={actionLoading} />
        </button>

        <div className="lang-segmented-control" role="group" aria-label={t('navbar.language_selector')}>
          {(['en', 'tr'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              className={`lang-segment ${currentLang === lang ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage(lang)}
              aria-pressed={currentLang === lang}
              title={lang === 'en' ? t('navbar.english') : t('navbar.turkish')}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="util-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? t('navbar.theme_light') : t('navbar.theme_dark')}
          aria-label={theme === 'dark' ? t('navbar.theme_light') : t('navbar.theme_dark')}
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
        </button>
      </div>
    </header>
  );
};
