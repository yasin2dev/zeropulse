import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserShield,
  faKey,
  faUser,
  faTriangleExclamation,
  faArrowRight,
  faLock,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import { BrandLogo } from './BrandLogo';

interface SetupWizardProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSetupSuccess: (token: string, user: { username: string; role: string }) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  theme,
  onToggleTheme,
  onSetupSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentLang = i18n.language?.startsWith('tr') ? 'tr' : 'en';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 3) {
      setError(t('auth.err_username_length'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.err_password_length'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.err_password_mismatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('auth.err_setup_failed'));
      }

      onSetupSuccess(data.token, data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.unknown_error');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper" data-theme={theme}>
      <div style={{ position: 'absolute', top: '1.25rem', right: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

        <button
          type="button"
          className="util-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? t('navbar.theme_light') : t('navbar.theme_dark')}
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <BrandLogo size={48} />
          <div className="auth-badge">
            <FontAwesomeIcon icon={faLock} />
            <span>{t('auth.setup_badge')}</span>
          </div>
          <h1 className="auth-title">{t('auth.setup_title')}</h1>
          <p className="auth-subtitle">
            {t('auth.setup_subtitle')}
          </p>
        </div>

        {error && (
          <div className="auth-alert danger">
            <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="setup-username">
              <span>{t('auth.admin_username')}</span>
              <FontAwesomeIcon icon={faUser} style={{ opacity: 0.5 }} />
            </label>
            <input
              id="setup-username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
              autoComplete="username"
            />
            <span className="form-helper">{t('auth.admin_username_helper')}</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="setup-password">
              <span>{t('auth.password')}</span>
              <FontAwesomeIcon icon={faKey} style={{ opacity: 0.5 }} />
            </label>
            <input
              id="setup-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
            <span className="form-helper">{t('auth.admin_password_helper')}</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="setup-confirm-password">
              <span>{t('auth.confirm_password')}</span>
              <FontAwesomeIcon icon={faKey} style={{ opacity: 0.5 }} />
            </label>
            <input
              id="setup-confirm-password"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? (
              <span>{t('auth.creating_account')}</span>
            ) : (
              <>
                <FontAwesomeIcon icon={faUserShield} />
                <span>{t('auth.create_admin_button')}</span>
                <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: '0.75rem' }} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
