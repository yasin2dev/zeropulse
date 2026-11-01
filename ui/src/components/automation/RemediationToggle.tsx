import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../ConfirmationModal';

interface RemediationToggleProps {
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
  appearance: 'switch' | 'button';
}

/** Leaving dry-run lets the agent restart containers on its own, so that direction always confirms. */
export const RemediationToggle: React.FC<RemediationToggleProps> = ({
  dryRun,
  onToggleDryRun,
  actionLoading,
  appearance,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (dryRun) setModalOpen(true);
    else onToggleDryRun(true);
  };

  const handleConfirm = async () => {
    if (await onToggleDryRun(false)) setModalOpen(false);
  };

  return (
    <>
      {appearance === 'switch' ? (
        <button
          type="button"
          role="switch"
          aria-checked={!dryRun}
          aria-label={t('pulse.safety_title')}
          className={`policy-switch ${dryRun ? '' : 'on'}`}
          onClick={handleClick}
          disabled={actionLoading}
          title={dryRun ? t('pulse.switch_to_active') : t('pulse.switch_to_dry_run')}
        >
          <span className="policy-switch-handle" />
        </button>
      ) : (
        <button
          type="button"
          className={dryRun ? 'btn-primary' : 'btn-secondary'}
          onClick={handleClick}
          disabled={actionLoading}
        >
          <FontAwesomeIcon icon={dryRun ? faBolt : faShieldHalved} />
          <span>{dryRun ? t('settings.btn_enable_remediation') : t('settings.btn_switch_dry_run')}</span>
        </button>
      )}

      <ConfirmationModal
        isOpen={modalOpen}
        title={t('pulse.modal_title')}
        message={t('pulse.modal_message')}
        confirmLabel={t('pulse.modal_confirm')}
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </>
  );
};
