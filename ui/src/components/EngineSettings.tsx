import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved,
  faBolt,
  faMicrochip,
  faMemory,
  faClock,
  faSliders,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from './ConfirmationModal';

interface EngineSettingsProps {
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
}

export const EngineSettings: React.FC<EngineSettingsProps> = ({
  dryRun,
  onToggleDryRun,
  actionLoading,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleToggleClick = () => {
    if (dryRun) {
      setModalOpen(true);
    } else {
      onToggleDryRun(true);
    }
  };

  const handleConfirm = async () => {
    const success = await onToggleDryRun(false);
    if (success) {
      setModalOpen(false);
    }
  };

  return (
    <div className="engine-settings-container">
      <div className="settings-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <FontAwesomeIcon icon={faSliders} className="panel-icon" />
            <div>
              <h2 className="panel-title">Kural Motoru ve İyileştirme Yapılandırması</h2>
              <p className="panel-subtitle">
                Anomali tespit eşikleri, flapping koruma süreleri ve otomatik iyileştirme politikası
              </p>
            </div>
          </div>
        </div>

        <div className="settings-grid">
          {/* Remediation Mode Master Control */}
          <div className="setting-card featured">
            <div className="setting-card-header">
              <div className="setting-card-title">
                <FontAwesomeIcon
                  icon={dryRun ? faShieldHalved : faBolt}
                  style={{ color: dryRun ? 'var(--status-warn-fg)' : 'var(--accent)' }}
                />
                <span>Otomatik İyileştirme (Self-Healing) Modu</span>
              </div>
              <span className={`status-pill sm ${dryRun ? 'status-warn' : 'status-danger'}`}>
                {dryRun ? 'Gözlem Modu (Dry-Run)' : 'Aktif Remediation'}
              </span>
            </div>

            <p className="setting-description">
              {dryRun
                ? 'Sistem güvenli gözlem modundadır. Eşik aşımlarında yalnızca yapılandırılmış AnomalyEvent logu üretilir, Docker API üzerinden yeniden başlatma komutu çalıştırılmaz.'
                : 'Dikkat: Aktif remediation devrededir. Eşiği 3 ardışık periyot aşan konteynerler Docker soketi üzerinden anında otomatik olarak yeniden başlatılır.'}
            </p>

            <div className="setting-action-row">
              <button
                type="button"
                className={dryRun ? 'btn-primary' : 'btn-secondary'}
                onClick={handleToggleClick}
                disabled={actionLoading}
              >
                <FontAwesomeIcon icon={dryRun ? faBolt : faShieldHalved} />
                <span>
                  {dryRun ? 'Aktif Remediation Modunu Etkinleştir' : 'Emniyetli Dry-Run Moduna Geç'}
                </span>
              </button>
            </div>
          </div>

          {/* Threshold Configurations */}
          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-card-title">
                <FontAwesomeIcon icon={faMicrochip} />
                <span>İşlemci (CPU) Doygunluk Eşiği</span>
              </div>
              <span className="status-pill sm status-ok">%80.0</span>
            </div>
            <p className="setting-description">
              Konteyner CPU kullanım oranı ardışık 3 periyot boyunca %80.0'in üzerinde kaldığında veya CFS kotaları tıkandığında (throttled periods) tetiklenir.
            </p>
            <div className="metric-meta-row">
              <span>Durum Takibi: 3 Periyot (15s)</span>
              <span>Aksiyon: RESTART_SUGGESTED</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-card-title">
                <FontAwesomeIcon icon={faMemory} />
                <span>Kritik Bellek (RAM) Eşiği</span>
              </div>
              <span className="status-pill sm status-ok">%85.0</span>
            </div>
            <p className="setting-description">
              Bellek tahsis sınırı %85.0 eşiğine ulaştığında OOM (Out-of-Memory) çökmesini engellemek için anında alarm üretilir.
            </p>
            <div className="metric-meta-row">
              <span>Hassasiyet: Anlık (1 Periyot)</span>
              <span>Aksiyon: RESTART_SUGGESTED</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-card-title">
                <FontAwesomeIcon icon={faClock} />
                <span>Flapping Koruması (Cooldown Süresi)</span>
              </div>
              <span className="status-pill sm status-ok">60 Saniye</span>
            </div>
            <p className="setting-description">
              Bir konteyner için iyileştirme aksiyonu tetiklendikten sonra aynı konteyner üzerinde 60 saniye boyunca yeni alarm ve aksiyon bastırılır.
            </p>
            <div className="metric-meta-row">
              <span>Tracker: In-Memory Ring Buffer</span>
              <span>Bellek Maliyeti: &lt;100 Bayt/Konteyner</span>
            </div>
          </div>
        </div>

        {/* Diagnostic API Info */}
        <div className="api-diagnostic-box">
          <div className="diagnostic-header">
            <FontAwesomeIcon icon={faCircleCheck} style={{ color: 'var(--status-ok)' }} />
            <span>Yerel Ajan API Uç Noktaları</span>
          </div>
          <div className="api-endpoint-list">
            <code>GET  /api/v1/health</code>
            <code>GET  /api/v1/status</code>
            <code>GET  /api/v1/stream (SSE)</code>
            <code>GET  /api/v1/containers</code>
            <code>POST /api/v1/containers/:id/restart</code>
            <code>PUT  /api/v1/config/dry-run</code>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalOpen}
        title="Aktif İyileştirme (Remediation) Moduna Geç"
        message="Dry-Run modunu kapatmak üzeresiniz. Eşik aşımlarında konteynerler kural motoru tarafından otomatik olarak YENİDEN BAŞLATILACAKTIR. Bu işlemi onaylıyor musunuz?"
        confirmLabel="Emniyeti Kaldır ve Aktif Et"
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
};
