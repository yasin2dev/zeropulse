import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRightToBracket,
  faKey,
  faUser,
  faTriangleExclamation,
  faShieldHalved,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import { BrandLogo } from './BrandLogo';

interface LoginViewProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLoginSuccess: (token: string, user: { username: string; role: string }) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  theme,
  onToggleTheme,
  onLoginSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentLang = i18n.language?.startsWith('tr') ? 'tr' : 'en';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError(t('auth.login_required_fields'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('auth.login_failed'));
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.invalid_credentials');
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
            <FontAwesomeIcon icon={faShieldHalved} />
            <span>{t('auth.login_badge')}</span>
          </div>
          <h1 className="auth-title">{t('auth.login_title')}</h1>
          <p className="auth-subtitle">
            {t('auth.login_subtitle')}
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
            <label className="form-label" htmlFor="login-username">
              <span>{t('auth.username')}</span>
              <FontAwesomeIcon icon={faUser} style={{ opacity: 0.5 }} />
            </label>
            <input
              id="login-username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              <span>{t('auth.password')}</span>
              <FontAwesomeIcon icon={faKey} style={{ opacity: 0.5 }} />
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? (
              <span>{t('auth.verifying')}</span>
            ) : (
              <>
                <FontAwesomeIcon icon={faRightToBracket} />
                <span>{t('auth.sign_in')}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
