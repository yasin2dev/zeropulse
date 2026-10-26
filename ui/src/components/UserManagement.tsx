import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faUserPlus,
  faUserShield,
  faEye,
  faKey,
  faTrash,
  faXmark,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { UserAccount } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface UserManagementProps {
  currentUser: { username: string; role: string };
  actionLoading: boolean;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Create User Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Change Password Modal State
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [changePasswordVal, setChangePasswordVal] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Delete User Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showToast = (text: string, isError: boolean = false) => {
    setFeedback({ text, isError });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUsername.trim().length < 3) {
      showToast('Kullanıcı adı en az 3 karakter olmalıdır.', true);
      return;
    }
    if (newPassword.length < 6) {
      showToast('Şifre en az 6 karakter olmalıdır.', true);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      showToast('Şifreler birbiriyle eşleşmiyor.', true);
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kullanıcı oluşturulamadı.');
      }

      showToast(`Kullanıcı ${newUsername} başarıyla oluşturuldu.`);
      setCreateModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setNewRole('viewer');
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kullanıcı oluşturulamadı.';
      showToast(msg, true);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;

    if (changePasswordVal.length < 6) {
      showToast('Yeni şifre en az 6 karakter olmalıdır.', true);
      return;
    }
    if (changePasswordVal !== changePasswordConfirm) {
      showToast('Şifreler birbiriyle eşleşmiyor.', true);
      return;
    }

    setPasswordSubmitting(true);
    try {
      const res = await fetch(`/api/v1/users/${passwordTarget}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: changePasswordVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Şifre güncellenemedi.');
      }

      showToast(`${passwordTarget} kullanıcısının şifresi başarıyla güncellendi.`);
      setPasswordTarget(null);
      setChangePasswordVal('');
      setChangePasswordConfirm('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Şifre güncellenemedi.';
      showToast(msg, true);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;

    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/v1/users/${deleteTarget}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kullanıcı silinemedi.');
      }

      showToast(`${deleteTarget} kullanıcısı silindi.`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kullanıcı silinemedi.';
      showToast(msg, true);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="user-management-container">
      <div className="users-toolbar">
        <div className="users-title-block">
          <FontAwesomeIcon icon={faUsers} style={{ opacity: 0.8 }} />
          <h2 className="users-title">Operatör ve Kullanıcı Yönetimi</h2>
          <span className="section-count">({users.length} Kayıtlı Kullanıcı)</span>
        </div>

        <div>
          <button
            type="button"
            className="btn-action-sm"
            onClick={() => setCreateModalOpen(true)}
            style={{ fontWeight: 600 }}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            <span>Yeni Kullanıcı Ekle</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            fontWeight: 600,
            background: feedback.isError ? 'var(--status-danger-bg)' : 'var(--status-ok-bg)',
            border: `1px solid ${feedback.isError ? 'var(--status-danger-border)' : 'var(--status-ok-border)'}`,
            color: feedback.isError ? 'var(--crimson)' : 'var(--status-ok)',
          }}
        >
          {feedback.text}
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>KULLANICI ADI</th>
              <th>YETKİ / ROL</th>
              <th>OLUŞTURULMA TARİHİ</th>
              <th>DURUM</th>
              <th>İŞLEMLER</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Kullanıcılar yükleniyor...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Kayıtlı kullanıcı bulunamadı.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.username === currentUser.username;
                const createdDate = new Date(u.created_at).toLocaleString();

                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                        {isSelf && (
                          <span
                            className="badge ok"
                            style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}
                          >
                            MEVCUT HESAP
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {u.role === 'admin' ? (
                        <span className="badge warning">
                          <FontAwesomeIcon icon={faUserShield} />
                          <span>YÖNETİCİ (ADMIN)</span>
                        </span>
                      ) : (
                        <span className="badge cooldown">
                          <FontAwesomeIcon icon={faEye} />
                          <span>GÖZLEMCİ (VIEWER)</span>
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <FontAwesomeIcon icon={faClock} style={{ opacity: 0.6 }} />
                        <span>{createdDate}</span>
                      </span>
                    </td>

                    <td>
                      <span className="badge ok">
                        <span>AKTİF</span>
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn-action-sm"
                          onClick={() => setPasswordTarget(u.username)}
                          title="Şifreyi Güncelle"
                        >
                          <FontAwesomeIcon icon={faKey} />
                          <span>Şifre</span>
                        </button>

                        <button
                          type="button"
                          className="btn-action-sm danger"
                          onClick={() => setDeleteTarget(u.username)}
                          disabled={isSelf}
                          title={isSelf ? 'Kendi hesabınızı silemezsiniz' : 'Kullanıcıyı Sil'}
                          style={{ opacity: isSelf ? 0.35 : 1 }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          <span>Sil</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Yeni Kullanıcı Oluştur */}
      {createModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="modal-title">
                <FontAwesomeIcon icon={faUserPlus} />
                <span>Yeni Kullanıcı Tanımla</span>
              </div>
              <button
                type="button"
                className="util-btn"
                onClick={() => setCreateModalOpen(false)}
                disabled={createSubmitting}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Kullanıcı Adı</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ornek_kullanici"
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Rol & Yetki</label>
                  <select
                    className="form-select"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
                  >
                    <option value="viewer">Gözlemci (Viewer) — Yalnızca Metrik ve Log İzleme</option>
                    <option value="admin">Yönetici (Admin) — Tam Erişim & Remediation Yetkisi</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Şifre</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <span className="form-helper">En az 6 karakter olmalıdır.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Şifre Tekrar</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createSubmitting}
                >
                  İptal
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={createSubmitting}>
                  {createSubmitting ? 'Kaydediliyor...' : 'Kullanıcıyı Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Şifre Değiştir */}
      {passwordTarget && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="modal-title">
                <FontAwesomeIcon icon={faKey} />
                <span>Şifre Güncelle: {passwordTarget}</span>
              </div>
              <button
                type="button"
                className="util-btn"
                onClick={() => setPasswordTarget(null)}
                disabled={passwordSubmitting}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Yeni Şifre</label>
                  <input
                    type="password"
                    className="form-input"
                    value={changePasswordVal}
                    onChange={(e) => setChangePasswordVal(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                  />
                  <span className="form-helper">En az 6 karakter girilmelidir.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Yeni Şifre Tekrar</label>
                  <input
                    type="password"
                    className="form-input"
                    value={changePasswordConfirm}
                    onChange={(e) => setChangePasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPasswordTarget(null)}
                  disabled={passwordSubmitting}
                >
                  İptal
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={passwordSubmitting}>
                  {passwordSubmitting ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kullanıcı Silme Onayı */}
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title="Kullanıcıyı Sil"
        message={`${deleteTarget} kullanıcısının sisteme erişim yetkisi tamamen kaldırılacaktır. Bu işlemi onaylıyor musunuz?`}
        confirmLabel="Kullanıcıyı Sil"
        isDanger={true}
        isLoading={deleteSubmitting}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
