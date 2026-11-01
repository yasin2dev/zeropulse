import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  loadingLabel?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loadingLabel,
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {isDanger && (
            <FontAwesomeIcon icon={faTriangleExclamation} className="modal-icon danger" />
          )}
          <h3 className="modal-title">{title}</h3>
        </div>
        <p className="modal-body">{message}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            className={isDanger ? 'btn-danger' : 'btn-secondary'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? loadingLabel || t('common.processing') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
