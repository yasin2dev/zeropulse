import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faMemory, faMicrochip } from '@fortawesome/free-solid-svg-icons';
import { formatPercent } from '../../i18n';

export const BaselineThresholds: React.FC = () => {
  const { t, i18n } = useTranslation();

  return (
    <div className="settings-grid">
      <div className="setting-card">
        <div className="setting-card-header">
          <div className="setting-card-title">
            <FontAwesomeIcon icon={faMicrochip} />
            <span>{t('settings.cpu_card_title')}</span>
          </div>
          <span className="status-pill sm status-ok">{formatPercent(80, i18n.language)}</span>
        </div>
        <p className="setting-description">
          {t('settings.cpu_card_desc')}
        </p>
        <div className="metric-meta-row">
          <span>{t('settings.cpu_card_tracking')}</span>
          <span>{t('settings.cpu_card_action')}</span>
        </div>
      </div>

      <div className="setting-card">
        <div className="setting-card-header">
          <div className="setting-card-title">
            <FontAwesomeIcon icon={faMemory} />
            <span>{t('settings.ram_card_title')}</span>
          </div>
          <span className="status-pill sm status-ok">{formatPercent(85, i18n.language)}</span>
        </div>
        <p className="setting-description">
          {t('settings.ram_card_desc')}
        </p>
        <div className="metric-meta-row">
          <span>{t('settings.ram_card_sensitivity')}</span>
          <span>{t('settings.ram_card_action')}</span>
        </div>
      </div>

      <div className="setting-card">
        <div className="setting-card-header">
          <div className="setting-card-title">
            <FontAwesomeIcon icon={faClock} />
            <span>{t('settings.cooldown_card_title')}</span>
          </div>
          <span className="status-pill sm status-ok">{t('settings.cooldown_val')}</span>
        </div>
        <p className="setting-description">
          {t('settings.cooldown_card_desc')}
        </p>
        <div className="metric-meta-row">
          <span>{t('settings.cooldown_tracker')}</span>
          <span>{t('settings.cooldown_cost')}</span>
        </div>
      </div>
    </div>
  );
};
