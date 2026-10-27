import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved,
  faBolt,
  faMicrochip,
  faMemory,
  faClock,
  faSliders,
  faCircleCheck,
  faPlus,
  faTrash,
  faRotateRight,
  faXmark,
  faFilter,
  faFileLines,
  faCircleExclamation,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from './ConfirmationModal';
import { CustomRule, MetricType, RuleOperator, RuleAction, RulesResponse } from '../types';

interface EngineSettingsProps {
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
  currentUser?: { username: string; role: string } | null;
}

export const EngineSettings: React.FC<EngineSettingsProps> = ({
  dryRun,
  onToggleDryRun,
  actionLoading,
  currentUser,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  // Dynamic Rules State
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [configPath, setConfigPath] = useState<string>('');
  const [rulesLoading, setRulesLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Create Rule Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('CPU_PERCENT');
  const [operator, setOperator] = useState<RuleOperator>('GT');
  const [threshold, setThreshold] = useState<string>('80');
  const [consecutivePeriods, setConsecutivePeriods] = useState<string>('3');
  const [action, setAction] = useState<RuleAction>('RESTART');
  const [cooldownSeconds, setCooldownSeconds] = useState<string>('60');
  const [containerFilter, setContainerFilter] = useState('');

  // Delete Rule State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const isAdmin = !currentUser || currentUser.role === 'admin';

  const fetchRules = useCallback(async () => {
    try {
      setRulesLoading(true);
      const res = await fetch('/api/v1/rules');
      if (res.ok) {
        const data: RulesResponse = await res.json();
        setRules(data.rules || []);
        setConfigPath(data.config_path || '');
      }
    } catch {
      // ignore
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

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

  const handleOpenCreateModal = () => {
    setRuleName('');
    setMetricType('CPU_PERCENT');
    setOperator('GT');
    setThreshold('80');
    setConsecutivePeriods('3');
    setAction('RESTART');
    setCooldownSeconds('60');
    setContainerFilter('');
    setCreateModalOpen(true);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const threshNum = parseFloat(threshold);
    const periodsNum = parseInt(consecutivePeriods, 10);
    const cooldownNum = parseInt(cooldownSeconds, 10);

    if (!ruleName.trim()) {
      setFeedback({ text: 'Kural adı boş bırakılamaz.', isError: true });
      return;
    }
    if (isNaN(threshNum) || threshNum < 0) {
      setFeedback({ text: 'Eşik değeri 0 veya daha büyük bir sayı olmalıdır.', isError: true });
      return;
    }
    if (isNaN(periodsNum) || periodsNum < 1) {
      setFeedback({ text: 'Ardışık periyot en az 1 olmalıdır.', isError: true });
      return;
    }
    if (isNaN(cooldownNum) || cooldownNum < 0) {
      setFeedback({ text: 'Cooldown süresi 0 veya daha büyük bir sayı olmalıdır.', isError: true });
      return;
    }

    const newRule: CustomRule = {
      name: ruleName.trim(),
      metric_type: metricType,
      operator: operator,
      threshold: threshNum,
      consecutive_periods: periodsNum,
      action: action,
      cooldown_seconds: cooldownNum,
      container_filter: containerFilter.trim(),
    };

    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/v1/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (res.ok) {
        setFeedback({ text: `✓ '${newRule.name}' kuralı başarıyla oluşturuldu ve kural motoruna eklendi.`, isError: false });
        setCreateModalOpen(false);
        fetchRules();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ text: errData.error || 'Kural oluşturulamadı.', isError: true });
      }
    } catch (err: unknown) {
      setFeedback({ text: `Ağ hatası: ${(err as Error).message}`, isError: true });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/rules/${encodeURIComponent(deleteTarget)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setFeedback({ text: `✓ '${deleteTarget}' kuralı başarıyla silindi.`, isError: false });
        setDeleteTarget(null);
        fetchRules();
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ text: errData.error || 'Kural silinemedi.', isError: true });
      }
    } catch (err: unknown) {
      setFeedback({ text: `Ağ hatası: ${(err as Error).message}`, isError: true });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const formatMetricLabel = (m: MetricType) => {
    switch (m) {
      case 'CPU_PERCENT':
        return 'CPU (%)';
      case 'MEM_PERCENT':
        return 'Bellek (%)';
      case 'CPU_THROTTLED_PERIODS':
        return 'CFS Kısıtlanma';
      case 'NET_RX_BYTES':
        return 'Ağ Gelen (RX)';
      case 'NET_TX_BYTES':
        return 'Ağ Giden (TX)';
      default:
        return m;
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
                Anomali tespit kuralları, flapping koruma süreleri ve otomatik self-healing politikası
              </p>
            </div>
          </div>
          {configPath && (
            <div className="telemetry-pill" title="Aktif kural yapılandırma dosyası">
              <FontAwesomeIcon icon={faFileLines} className="pill-icon" />
              <span className="pill-key">Dosya:</span>
              <span className="pill-val" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {configPath}
              </span>
            </div>
          )}
        </div>

        {feedback && (
          <div className={`feedback-banner ${feedback.isError ? 'error' : 'success'}`} style={{ margin: '1rem 0' }}>
            <FontAwesomeIcon icon={feedback.isError ? faCircleExclamation : faCheck} />
            <span>{feedback.text}</span>
            <button type="button" className="close-btn" onClick={() => setFeedback(null)} aria-label="Kapat">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}

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
                ? 'Sistem güvenli gözlem modundadır. Eşik aşımlarında yalnızca yapılandırılmış AnomalyEvent logu üretilir, konteynerlere yeniden başlatma müdahalesi yapılmaz.'
                : 'Dikkat: Aktif remediation devrededir. Eşik kurallarını aşan konteynerler Docker soketi üzerinden otomatik olarak anında yeniden başlatılır.'}
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

          {/* Hardcoded Engine Baseline Thresholds */}
          <div className="setting-card">
            <div className="setting-card-header">
              <div className="setting-card-title">
                <FontAwesomeIcon icon={faMicrochip} />
                <span>Varsayılan CPU Doygunluk Eşiği</span>
              </div>
              <span className="status-pill sm status-ok">%80.0</span>
            </div>
            <p className="setting-description">
              Konteyner CPU kullanım oranı ardışık 3 periyot boyunca %80.0'in üzerinde kaldığında veya CFS kotaları tıkandığında tetiklenir.
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
                <span>Varsayılan RAM Eşiği</span>
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
                <span>Flapping Koruması (Cooldown)</span>
              </div>
              <span className="status-pill sm status-ok">60 Saniye</span>
            </div>
            <p className="setting-description">
              Bir konteyner için iyileştirme aksiyonu tetiklendikten sonra aynı konteyner üzerinde 60 saniye boyunca yeni alarm bastırılır.
            </p>
            <div className="metric-meta-row">
              <span>Tracker: In-Memory Ring Buffer</span>
              <span>Bellek Maliyeti: &lt;100 Bayt/Konteyner</span>
            </div>
          </div>
        </div>

        {/* Dynamic Custom Rules Management Section */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
                Özel Eşik Kuralları ({rules.length})
              </h3>
              <span className="status-pill sm status-ok">
                {rules.length} Aktif Kural
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary sm"
                onClick={fetchRules}
                disabled={rulesLoading}
                title="Kuralları Yenile"
              >
                <FontAwesomeIcon icon={faRotateRight} spin={rulesLoading} />
                <span>Yenile</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="btn-primary sm"
                  onClick={handleOpenCreateModal}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Yeni Kural Oluştur</span>
                </button>
              )}
            </div>
          </div>

          {rulesLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              Kurallar yükleniyor...
            </div>
          ) : rules.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                border: '1px dashed var(--line)',
                borderRadius: 'var(--r-md)',
                padding: '2.5rem',
                textAlign: 'center',
              }}
            >
              <FontAwesomeIcon icon={faSliders} style={{ fontSize: '2rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Henüz Özel Kural Tanımlanmamış</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '500px', margin: '0 auto 1.25rem' }}>
                ZeroPulse kural motoruna YAML/JSON üzerinden veya doğrudan bu panelden yeni eşik kuralları ekleyebilirsiniz.
              </p>
              {isAdmin && (
                <button type="button" className="btn-primary sm" onClick={handleOpenCreateModal}>
                  <FontAwesomeIcon icon={faPlus} />
                  <span>İlk Kuralı Tanımla</span>
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>KURAL ADI</th>
                    <th>METRİK</th>
                    <th>KOŞUL</th>
                    <th>SÜRE / PERİYOT</th>
                    <th>AKSİYON</th>
                    <th>COOLDOWN</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>İŞLEM</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                          {r.container_filter ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FontAwesomeIcon icon={faFilter} style={{ fontSize: '0.7rem' }} />
                              Filtre: {r.container_filter}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Tüm Konteynerler</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="status-pill sm" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--line)' }}>
                          {formatMetricLabel(r.metric_type)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {r.operator === 'GT' ? '>' : '>='} {r.threshold}
                          {r.metric_type === 'CPU_PERCENT' || r.metric_type === 'MEM_PERCENT' ? '%' : ''}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem' }}>
                          {r.consecutive_periods} Periyot ({r.consecutive_periods * 5}s)
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill sm ${
                            r.action === 'RESTART'
                              ? 'status-danger'
                              : r.action === 'SCALE'
                              ? 'status-warn'
                              : 'status-ok'
                          }`}
                        >
                          {r.action}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {r.cooldown_seconds}s
                        </span>
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-secondary sm"
                            style={{ color: 'var(--status-danger-fg)' }}
                            onClick={() => setDeleteTarget(r.name)}
                            title="Kuralı Sil"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Diagnostic API Info */}
        <div className="api-diagnostic-box" style={{ marginTop: '2rem' }}>
          <div className="diagnostic-header">
            <FontAwesomeIcon icon={faCircleCheck} style={{ color: 'var(--status-ok)' }} />
            <span>Yerel Ajan API Uç Noktaları</span>
          </div>
          <div className="api-endpoint-list">
            <code>GET  /api/v1/health</code>
            <code>GET  /api/v1/status</code>
            <code>GET  /api/v1/stream (SSE)</code>
            <code>GET  /api/v1/containers</code>
            <code>GET  /api/v1/rules</code>
            <code>POST /api/v1/rules</code>
            <code>DELETE /api/v1/rules/:name</code>
            <code>POST /api/v1/containers/:id/restart</code>
            <code>PUT  /api/v1/config/dry-run</code>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Active Remediation */}
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

      {/* Confirmation Modal for Rule Deletion */}
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        title="Kuralı Sil"
        message={`'${deleteTarget}' isimli kuralı silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve kural dosyasından kaldırılacaktır.`}
        confirmLabel="Kuralı Sil"
        isDanger={true}
        isLoading={deleteSubmitting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create Rule Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Yeni Eşik Kuralı Oluştur</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Kapat"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreateRule}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Kural Adı *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Örn: api-high-cpu-restart"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    required
                  />
                  <span className="form-helper">Benzersiz kural tanımlayıcısı (boşluksuz, alfanümerik/tire).</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">İzlenecek Metrik *</label>
                    <select
                      className="form-select"
                      value={metricType}
                      onChange={(e) => setMetricType(e.target.value as MetricType)}
                    >
                      <option value="CPU_PERCENT">CPU Kullanımı (%)</option>
                      <option value="MEM_PERCENT">Bellek Kullanımı (%)</option>
                      <option value="CPU_THROTTLED_PERIODS">CFS Kota Tıkanması (Periyot)</option>
                      <option value="NET_RX_BYTES">Ağ Gelen Trafik (Byte)</option>
                      <option value="NET_TX_BYTES">Ağ Giden Trafik (Byte)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Operatör *</label>
                    <select
                      className="form-select"
                      value={operator}
                      onChange={(e) => setOperator(e.target.value as RuleOperator)}
                    >
                      <option value="GT">Büyüktür (&gt;)</option>
                      <option value="GTE">Büyük veya Eşittir (&gt;=)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Eşik Değeri *</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-input"
                      placeholder="Örn: 80"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      required
                    />
                    <span className="form-helper">Yüzde veya sayısal sınır.</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ardışık Periyot *</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      placeholder="3"
                      value={consecutivePeriods}
                      onChange={(e) => setConsecutivePeriods(e.target.value)}
                      required
                    />
                    <span className="form-helper">{parseInt(consecutivePeriods || '1', 10) * 5} sn sürdürülen ihlal.</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Aksiyon *</label>
                    <select
                      className="form-select"
                      value={action}
                      onChange={(e) => setAction(e.target.value as RuleAction)}
                    >
                      <option value="RESTART">Yeniden Başlat (RESTART)</option>
                      <option value="NOTIFY">Yalnızca Uyar (NOTIFY)</option>
                      <option value="SCALE">Ölçekleme Talebi (SCALE)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Cooldown Süresi (sn) *</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder="60"
                      value={cooldownSeconds}
                      onChange={(e) => setCooldownSeconds(e.target.value)}
                      required
                    />
                    <span className="form-helper">Flapping koruma süresi.</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Konteyner Filtresi (Opsiyonel)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Örn: api-server (Tüm konteynerler için boş bırakın)"
                    value={containerFilter}
                    onChange={(e) => setContainerFilter(e.target.value)}
                  />
                  <span className="form-helper">Yalnızca bu isme sahip konteynerler değerlendirilir.</span>
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createSubmitting}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Kaydediliyor...' : 'Kuralı Oluştur ve Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
