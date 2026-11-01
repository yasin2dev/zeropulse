import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
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
import { formatDateTime } from '../i18n';

interface UserManagementProps {
  currentUser: { username: string; role: string };
  actionLoading: boolean;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const { t, i18n } = useTranslation();
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
      showToast(t('users.val_user_min'), true);
      return;
    }
    if (newPassword.length < 6) {
      showToast(t('users.val_pw_min'), true);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      showToast(t('users.val_pw_match'), true);
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
        throw new Error(data.error || t('users.toast_create_fail'));
      }

      showToast(t('users.toast_create_success', { username: newUsername }));
      setCreateModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setNewRole('viewer');
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('users.toast_create_fail');
      showToast(msg, true);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;

    if (changePasswordVal.length < 6) {
      showToast(t('users.val_new_pw_min'), true);
      return;
    }
    if (changePasswordVal !== changePasswordConfirm) {
      showToast(t('users.val_pw_match'), true);
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
        throw new Error(data.error || t('users.toast_pw_fail'));
      }

      showToast(t('users.toast_pw_success', { username: passwordTarget }));
      setPasswordTarget(null);
      setChangePasswordVal('');
      setChangePasswordConfirm('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('users.toast_pw_fail');
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
        throw new Error(data.error || t('users.toast_delete_fail'));
      }

      showToast(t('users.toast_delete_success', { username: deleteTarget }));
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('users.toast_delete_fail');
      showToast(msg, true);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="user-management-container">
      <div className="users-toolbar">
        <div className="users-title-block">
          <span className="section-count">{t('users.count', { count: users.length })}</span>
        </div>

        <div>
          <button
            type="button"
            className="btn-action-sm"
            onClick={() => setCreateModalOpen(true)}
            style={{ fontWeight: 600 }}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            <span>{t('users.add_user')}</span>
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
              <th>{t('users.th_username')}</th>
              <th>{t('users.th_role')}</th>
              <th>{t('users.th_created')}</th>
              <th>{t('users.th_status')}</th>
              <th>{t('users.th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  {t('users.loading')}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  {t('users.empty')}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.username === currentUser.username;
                const createdDate = formatDateTime(u.created_at, i18n.language);

                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                        {isSelf && (
                          <span className="status-pill sm status-ok" style={{ fontSize: '0.625rem' }}>
                            {t('users.current_account')}
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      {u.role === 'admin' ? (
                        <span className="status-pill sm status-warn">
                          <FontAwesomeIcon icon={faUserShield} />
                          <span>{t('users.role_admin')}</span>
                        </span>
                      ) : (
                        <span className="status-pill sm status-neutral">
                          <FontAwesomeIcon icon={faEye} />
                          <span>{t('users.role_viewer')}</span>
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
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
                      <span className="status-pill sm status-ok">
                        <span>{t('users.status_active')}</span>
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn-action-sm"
                          onClick={() => setPasswordTarget(u.username)}
                          title={t('users.tip_password')}
                        >
                          <FontAwesomeIcon icon={faKey} />
                          <span>{t('users.btn_password')}</span>
                        </button>

                        <button
                          type="button"
                          className="btn-action-sm danger"
                          onClick={() => setDeleteTarget(u.username)}
                          disabled={isSelf}
                          title={isSelf ? t('users.tip_delete_self') : t('users.tip_delete')}
                          style={{ opacity: isSelf ? 0.35 : 1 }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          <span>{t('users.btn_delete')}</span>
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
                <span>{t('users.modal_create_title')}</span>
              </div>
              <button
                type="button"
                className="util-btn"
                onClick={() => setCreateModalOpen(false)}
                disabled={createSubmitting}
                aria-label={t('common.close')}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t('users.form_username')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={t('users.form_username_ph')}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t('users.form_role')}</label>
                  <select
                    className="form-select"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
                  >
                    <option value="viewer">{t('users.role_viewer_desc')}</option>
                    <option value="admin">{t('users.role_admin_desc')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('users.form_password')}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <span className="form-helper">{t('users.form_password_help')}</span>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('users.form_confirm_password')}</label>
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
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={createSubmitting}>
                  {createSubmitting ? t('users.btn_creating') : t('users.btn_create')}
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
                <span>{t('users.modal_pw_title', { username: passwordTarget })}</span>
              </div>
              <button
                type="button"
                className="util-btn"
                onClick={() => setPasswordTarget(null)}
                disabled={passwordSubmitting}
                aria-label={t('common.close')}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t('users.form_new_pw')}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={changePasswordVal}
                    onChange={(e) => setChangePasswordVal(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                  />
                  <span className="form-helper">{t('users.form_new_pw_help')}</span>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('users.form_new_pw_confirm')}</label>
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
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={passwordSubmitting}>
                  {passwordSubmitting ? t('users.btn_updating_pw') : t('users.btn_update_pw')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Kullanıcı Silme Onayı */}
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title={t('users.modal_delete_title')}
        message={t('users.modal_delete_msg', { username: deleteTarget || '' })}
        confirmLabel={t('users.modal_delete_confirm')}
        isDanger={true}
        isLoading={deleteSubmitting}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
