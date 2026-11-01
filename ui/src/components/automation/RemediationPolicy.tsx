import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { RemediationToggle } from './RemediationToggle';

interface RemediationPolicyProps {
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
}

export const RemediationPolicy: React.FC<RemediationPolicyProps> = ({
  dryRun,
  onToggleDryRun,
  actionLoading,
}) => {
  const { t } = useTranslation();

  return (
    <div className="setting-card featured">
      <div className="setting-card-header">
        <div className="setting-card-title">
          <FontAwesomeIcon
            icon={dryRun ? faShieldHalved : faBolt}
            style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
          />
          <span>{t('settings.featured_title')}</span>
        </div>
        <span className={`status-pill sm ${dryRun ? 'status-warn' : 'status-danger'}`}>
          {dryRun ? t('settings.status_dry_run') : t('settings.status_remediation')}
        </span>
      </div>

      <p className="setting-description">{dryRun ? t('settings.desc_dry_run') : t('settings.desc_active')}</p>

      <div className="setting-action-row">
        <RemediationToggle
          dryRun={dryRun}
          onToggleDryRun={onToggleDryRun}
          actionLoading={actionLoading}
          appearance="button"
        />
      </div>
    </div>
  );
};
