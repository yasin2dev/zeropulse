import React, { useState } from 'react';
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Lütfen kullanıcı adı ve şifrenizi girin.');
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
        throw new Error(data.error || 'Giriş yapılamadı.');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kullanıcı adı veya şifre hatalı.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper" data-theme={theme}>
      <div style={{ position: 'absolute', top: '1.25rem', right: '1.5rem' }}>
        <button
          type="button"
          className="util-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <BrandLogo size={48} />
          <div className="auth-badge">
            <FontAwesomeIcon icon={faShieldHalved} />
            <span>APPLIANCE ACCESS GATEWAY</span>
          </div>
          <h1 className="auth-title">Oturum Açın</h1>
          <p className="auth-subtitle">
            Zeropulse Edge Management arayüzüne erişmek için kimlik bilgilerinizi giriniz.
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
              <span>Kullanıcı Adı</span>
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
              <span>Şifre</span>
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
              <span>Doğrulanıyor...</span>
            ) : (
              <>
                <FontAwesomeIcon icon={faRightToBracket} />
                <span>Panele Giriş Yap</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
