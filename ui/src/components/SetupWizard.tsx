import React, { useState } from 'react';
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
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre güvenliği için en az 6 karakter girilmelidir.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
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
        throw new Error(data.error || 'İlk kurulum gerçekleştirilemedi.');
      }

      onSetupSuccess(data.token, data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.';
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
            <FontAwesomeIcon icon={faLock} />
            <span>İlk Kurulum &middot; Zero-Trust Setup</span>
          </div>
          <h1 className="auth-title">Süper Yönetici Hesabı Oluştur</h1>
          <p className="auth-subtitle">
            Zeropulse Edge Gateway donanım paneline hoş geldiniz. Sisteminizi güvene almak için ilk
            root yönetici (Superuser) hesabınızı tanımlayın.
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
              <span>Yönetici Kullanıcı Adı</span>
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
            <span className="form-helper">Root yetkilerine sahip ana kullanıcı kimliği.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="setup-password">
              <span>Şifre</span>
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
            <span className="form-helper">En az 6 karakterden oluşan güçlü bir parola seçin.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="setup-confirm-password">
              <span>Şifre Tekrar</span>
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
              <span>Hesap Oluşturuluyor...</span>
            ) : (
              <>
                <FontAwesomeIcon icon={faUserShield} />
                <span>Yöneticiyi Oluştur ve Giriş Yap</span>
                <FontAwesomeIcon icon={faArrowRight} style={{ fontSize: '0.75rem' }} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
