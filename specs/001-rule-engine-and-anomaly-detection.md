# RFC 001 — Rule Engine ve Anomaly Detection

| Alan | Değer |
|---|---|
| RFC No | 001 |
| Başlık | Rule Engine ve Anomaly Detection |
| Durum | Draft |
| Yazar | Zeropulse Team |
| Oluşturulma | 2025 |
| Güncelleme | — |
| İlgili Spec | `.kiro/specs/rule-engine-and-anomaly-detection/requirements.md` |

---

## Özet

Bu RFC, Zeropulse ajanına eklenmesi planlanan **kural motoru (Rule Engine)** ve **anomali tespit (Anomaly Detection)** sistemini tanımlar. Sistem; kullanıcıların YAML/JSON formatında tanımladığı kuralları her metrik toplama döngüsünde değerlendirecek, ardışık eşik aşımlarını takip edecek ve anomali tespit ettiğinde yapılandırılmış `AnomalyEvent` üretecektir.

Önerilen aksiyonlar (`RESTART`, `NOTIFY`, `SCALE`) **dry-run modunda** yalnızca loglanacak, **remediation modunda** gerçekten uygulanacaktır. Flapping koruması için `CooldownTracker` bileşeni, yanlış alarm filtrelemesi için ise `StateTracker` (ardışık periyot takibi) bileşeni kullanılacaktır.

---

## Motivasyon ve Bağlam

Zeropulse şu an her 5 saniyede bir metrik toplayıp ham JSON olarak `stdout`'a yazmaktadır. Toplanan metrikler:

```
ContainerMetrics:
  CPUPercent          float64
  MemPercent          float64
  MemUsageBytes       uint64
  MemLimitBytes       uint64
  CPUThrottledPeriods uint64
  CPUThrottledTimeNs  uint64
  NetRxBytes          uint64
  NetTxBytes          uint64
```

Bu metrikler şu an tüketici tarafa ham olarak bırakılmaktadır. Platform operatörleri için iki temel ihtiyaç doğmuştur:

1. **Eşik tabanlı anomali tespiti** — "CPU %85'in üzerinde 3 ardışık periyot kalırsa uyar" gibi koşulların kod değiştirmeden tanımlanabilmesi.
2. **Otomatik iyileştirme (self-healing)** — Anomali tespitinin ardından konteynerin yeniden başlatılması veya dışarıya bildirim yapılması.

Bu RFC, bu iki ihtiyacı karşılayacak bileşen mimarisini ve davranış sözleşmesini tanımlar.

---

## Tasarım Hedefleri

| Hedef | Açıklama |
|---|---|
| **Kod değişikliği gerektirmez** | Tüm kurallar YAML/JSON konfigürasyon dosyasıyla tanımlanır |
| **Yanlış alarm azaltma** | Ardışık periyot kontrolü ile anlık spike'lar görmezden gelinir |
| **Flapping koruması** | Cooldown mekanizması ile aynı kural defalarca tetiklenmez |
| **Güvenli deneme** | Dry-run modu ile aksiyonlar önce gözlemlenebilir |
| **Çift ortam desteği** | Docker ve Standalone modların her ikisinde çalışır |
| **Minimal bağımlılık** | Harici servis veya veritabanı gerektirmez; tüm durum bellekte tutulur |
| **Yapılandırılmış çıktı** | `AnomalyEvent`'ler mevcut JSON akışından bağımsız, ayrıştırılabilir formatta yayımlanır |

---

## Mimari Genel Görünüm

```
┌─────────────────────────────────────────────────────────────┐
│                        Zeropulse Agent                       │
│                                                             │
│  ┌──────────────┐    CollectorSnapshot    ┌──────────────┐  │
│  │   Collector   │ ──────────────────────▶│  RuleEngine  │  │
│  │  (Docker /   │                        │              │  │
│  │  Standalone) │                        │ ┌──────────┐ │  │
│  └──────────────┘                        │ │  State   │ │  │
│                                          │ │ Tracker  │ │  │
│  ┌──────────────┐                        │ └──────────┘ │  │
│  │ConfigLoader  │──── []Rule ───────────▶│              │  │
│  │(YAML / JSON) │                        │ ┌──────────┐ │  │
│  └──────────────┘                        │ │Cooldown  │ │  │
│                                          │ │ Tracker  │ │  │
│                                          │ └──────────┘ │  │
│                                          └──────┬───────┘  │
│                                                 │           │
│                                       AnomalyEvent (JSON)   │
│                                                 │           │
│                                            stdout           │
└─────────────────────────────────────────────────────────────┘
```

---

## Bileşenler

### 1. `Rule` — Kural Veri Yapısı

Kullanıcı tanımlı eşik kuralını temsil eden yapı. Her kural aşağıdaki bilgileri içerir:

```go
// internal/engine/rule.go (taslak)
type MetricType string
type Operator string
type Action string

const (
    MetricCPUPercent         MetricType = "CPU_PERCENT"
    MetricMemPercent         MetricType = "MEM_PERCENT"
    MetricCPUThrottledPeriods MetricType = "CPU_THROTTLED_PERIODS"
    MetricNetRxBytes         MetricType = "NET_RX_BYTES"
    MetricNetTxBytes         MetricType = "NET_TX_BYTES"
)

const (
    OperatorGT  Operator = "GT"
    OperatorGTE Operator = "GTE"
)

const (
    ActionRestart Action = "RESTART"
    ActionNotify  Action = "NOTIFY"
    ActionScale   Action = "SCALE"
)

type Rule struct {
    Name               string     `yaml:"name"                json:"name"`
    MetricType         MetricType `yaml:"metric_type"         json:"metric_type"`
    Operator           Operator   `yaml:"operator"            json:"operator"`
    Threshold          float64    `yaml:"threshold"           json:"threshold"`
    ConsecutivePeriods int        `yaml:"consecutive_periods" json:"consecutive_periods"`
    Action             Action     `yaml:"action"              json:"action"`
    CooldownSeconds    int        `yaml:"cooldown_seconds"    json:"cooldown_seconds"`
    ContainerFilter    string     `yaml:"container_filter"    json:"container_filter"`
}
```

**Doğrulama kuralları:**
- `ConsecutivePeriods` ≥ 1
- `CooldownSeconds` ≥ 0
- `Threshold` ≥ 0
- `MetricType`, `Operator`, `Action` geçerli enum değeri olmalı

---

### 2. `AnomalyEvent` — Anomali Olay Kaydı

Kural ihlali tespit edildiğinde üretilen yapılandırılmış olay:

```go
// internal/engine/event.go (taslak)
type AnomalyEvent struct {
    Timestamp        time.Time  `json:"timestamp"`
    EventType        string     `json:"event_type"`         // sabit: "anomaly"
    Mode             string     `json:"mode"`               // "dry-run" | "remediation"
    ContainerID      string     `json:"container_id"`
    ContainerName    string     `json:"container_name"`
    RuleName         string     `json:"rule_name"`
    MetricType       string     `json:"metric_type"`
    CurrentValue     float64    `json:"current_value"`
    Threshold        float64    `json:"threshold"`
    ConsecutiveCount int        `json:"consecutive_count"`
    Action           string     `json:"action"`
    DryRun           bool       `json:"dry_run"`
}
```

---

### 3. `StateTracker` — Ardışık Periyot Takipçisi

Her `(RuleName, ContainerID)` çifti için ardışık eşik aşım sayısını bellekte tutar.

**Davranış:**
- Eşik aşılırsa → sayaç `+1`
- Eşik aşılmazsa → sayaç `0`'a sıfırlanır
- `count >= ConsecutivePeriods` olduğunda → tetikleme sinyali üretilir
- Artık görünmeyen konteynerler için kayıtlar silinir

```go
// internal/engine/state.go (taslak)
type stateKey struct {
    RuleName    string
    ContainerID string
}

type StateTracker struct {
    mu      sync.Mutex
    counts  map[stateKey]int
}
```

---

### 4. `CooldownTracker` — Flapping Önleyici

Aynı `(RuleName, ContainerID)` çifti için son tetiklenme zamanını tutar.

**Davranış:**
- Tetiklenme sonrası `CooldownSeconds` geçmeden aynı çift için yeni olay üretilmez
- `CooldownSeconds == 0` ise hiçbir kısıtlama uygulanmaz
- Artık görünmeyen konteynerler için kayıtlar silinir

```go
// internal/engine/cooldown.go (taslak)
type CooldownTracker struct {
    mu        sync.Mutex
    lastFired map[stateKey]time.Time
}
```

---

### 5. `RuleEngine` — Ana Değerlendirme Motoru

Tüm bileşenleri orkestre eden ve her `CollectorSnapshot` için kural değerlendirme döngüsünü çalıştıran bileşen.

**Değerlendirme sırası (her periyot, her konteyner, her kural için):**

```
1. ContainerFilter eşleşmesi kontrol edilir
2. Metrik değeri çekilir
3. Operatör ile eşik karşılaştırması yapılır
   ├─ Eşik aşılmadı → StateTracker sıfırla, devam et
   └─ Eşik aşıldı   → StateTracker +1
                        ├─ ConsecutivePeriods dolmadı → devam et
                        └─ ConsecutivePeriods doldu  → CooldownTracker kontrol
                             ├─ Cooldown süresi dolmadı → atla
                             └─ Cooldown süresi doldu  → AnomalyEvent üret
                                                          CooldownTracker güncelle
```

---

### 6. `ConfigLoader` — Konfigürasyon Yükleyici

YAML ve JSON formatlarını destekleyen, başlangıçta çalışan konfigürasyon okuyucu.

**Desteklenen format:** YAML (birincil), JSON (ikincil)  
**Başlatma:** `--config <dosya>` CLI argümanıyla  
**Hata politikası:** Geçersiz kurallar atlanır ve uyarı loglanır; geçersiz dosya formatı ajanı durdurur

---

## Konfigürasyon Şeması

```yaml
# zeropulse-rules.yaml

rules:
  - name: "high-cpu-alert"
    metric_type: "CPU_PERCENT"
    operator: "GTE"
    threshold: 85.0
    consecutive_periods: 3
    action: "NOTIFY"
    cooldown_seconds: 60
    container_filter: ""

  - name: "critical-cpu-restart"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 95.0
    consecutive_periods: 2
    action: "RESTART"
    cooldown_seconds: 300
    container_filter: "api-server"

  - name: "high-memory"
    metric_type: "MEM_PERCENT"
    operator: "GTE"
    threshold: 90.0
    consecutive_periods: 3
    action: "NOTIFY"
    cooldown_seconds: 120
    container_filter: ""

  - name: "cpu-throttling-warn"
    metric_type: "CPU_THROTTLED_PERIODS"
    operator: "GT"
    threshold: 100
    consecutive_periods: 2
    action: "NOTIFY"
    cooldown_seconds: 60
    container_filter: ""
```

---

## Çalışma Modları

### Dry-run Modu

```bash
zeropulse-agent --config zeropulse-rules.yaml --dry-run
```

- Tüm aksiyonlar yalnızca loglanır, Docker API'ye yazma isteği gönderilmez.
- `AnomalyEvent.DryRun = true`, `mode = "dry-run"` olarak işaretlenir.
- Üretim öncesi kural testlemesi için önerilen moddur.

### Remediation Modu

```bash
zeropulse-agent --config zeropulse-rules.yaml
```

- Anomali tespitinde tanımlı aksiyonlar gerçekten uygulanır.
- `AnomalyEvent.DryRun = false`, `mode = "remediation"` olarak işaretlenir.

---

## Çıktı Formatı

Mevcut metrik snapshot'larıyla birlikte `stdout`'a yazılan `AnomalyEvent` örneği:

```json
{
  "timestamp": "2025-01-15T10:23:45.123Z",
  "event_type": "anomaly",
  "mode": "dry-run",
  "container_id": "a3f1b2c4d5e6",
  "container_name": "api-server",
  "rule_name": "high-cpu-alert",
  "metric_type": "CPU_PERCENT",
  "current_value": 91.5,
  "threshold": 85.0,
  "consecutive_count": 3,
  "action": "NOTIFY",
  "dry_run": true
}
```

> **Not:** `AnomalyEvent`'ler mevcut `DockerMetricsSnapshot` / `StandaloneSnapshot` JSON nesnelerinden bağımsız, kendi satırlarında yayımlanır. Tüketiciler `event_type` alanına göre olayları birbirinden ayırabilir.

---

## Standalone Ortam Davranışı

Standalone modda Docker konteyneri yoktur; kural değerlendirmesi host seviyesinde yapılır:

| Alan | Docker Modu | Standalone Modu |
|---|---|---|
| `container_id` | Konteyner short ID | `"host"` |
| `container_name` | Konteyner adı | `hostname` |
| `CPU_PERCENT` kaynağı | `ContainerMetrics.CPUPercent` | `CPUStats.UsagePercent` ortalaması |
| `MEM_PERCENT` kaynağı | `ContainerMetrics.MemPercent` | `MemStats.UsagePercent` |
| `CPU_THROTTLED_PERIODS` | Desteklenir | **Desteklenmez** — kural atlanır |
| `NET_RX_BYTES` / `NET_TX_BYTES` | Desteklenir | **Desteklenmez** — kural atlanır |

---

## Bağımlılıklar

Bu özellik mevcut bağımlılıkların dışında yeni bir Go modülü gerektirmez:

| İhtiyaç | Çözüm |
|---|---|
| YAML ayrıştırma | `gopkg.in/yaml.v3` (yeni bağımlılık — küçük, stabil) |
| JSON ayrıştırma | Standart kütüphane `encoding/json` |
| Eşzamanlılık | Standart kütüphane `sync` |
| Zaman yönetimi | Standart kütüphane `time` |

---

## Test Stratejisi

### Birim Testler

| Test | Doğrulanan Davranış |
|---|---|
| `TestRuleValidation` | Geçersiz `ConsecutivePeriods`, `Threshold`, `CooldownSeconds` hata döndürür |
| `TestOperatorGT` | GT operatörü: `value > threshold` → tetikler, `value == threshold` → tetiklemez |
| `TestOperatorGTE` | GTE operatörü: `value >= threshold` → tetikler, `value < threshold` → tetiklemez |
| `TestStateTrackerReset` | Eşik aşılmadığında sayaç sıfırlanır |
| `TestStateTrackerTrigger` | `ConsecutivePeriods` dolduğunda tetikleme sinyali üretilir |
| `TestCooldownBlock` | Cooldown süresi dolmadan aynı kural yeniden tetiklenmez |
| `TestCooldownExpiry` | Cooldown süresi dolduktan sonra yeniden tetiklenebilir |
| `TestCooldownZero` | `CooldownSeconds == 0` ise her periyot tetiklenir |
| `TestContainerFilter` | Filtre eşleşmiyorsa kural değerlendirmesi atlanır |
| `TestContainerFilterEmpty` | Boş filtre tüm konteynerlere uygulanır |
| `TestDryRunFlag` | Dry-run modunda `DryRun == true`, remediation modunda `false` |
| `TestUnknownMetricType` | Tanımlanmamış metrik tipi konfigürasyon hatası üretir |
| `TestStandaloneUnsupportedMetric` | Standalone modda throttle/net kuralı uyarıyla atlanır |

### Round-trip Testleri (Konfigürasyon Seri/Deserializasyon)

```
YAML → []Rule → YAML → []Rule: eşdeğer yapılar üretmelidir
JSON → []Rule → JSON → []Rule: eşdeğer yapılar üretmelidir
```

### Simülasyon Testi

Gerçek Docker daemon olmadan, mock `CollectorSnapshot` akışı üzerinde uçtan uca senaryo testi:

1. 2 periyot eşik altı → `AnomalyEvent` üretilmemeli
2. 3. periyot eşik üstü → `ConsecutivePeriods` henüz dolmamış → olay yok
3. 4. periyot eşik üstü → tetiklenme → `AnomalyEvent` üretilmeli
4. 5. periyot (cooldown içinde) → olay üretilmemeli
5. Cooldown süresi geçtikten sonra eşik üstü → tekrar `AnomalyEvent` üretilmeli

---

## Kapsam Dışı (Bu RFC)

Aşağıdaki başlıklar bu RFC'nin kapsamı dışında olup gelecekteki RFC'lerde ele alınacaktır:

- `RESTART` ve `SCALE` aksiyonlarının Docker API entegrasyonu (Remediation Engine — RFC 002)
- `NOTIFY` aksiyon tipi için webhook / alerting entegrasyonu (Alerting Channels — RFC 003)
- Konfigürasyon dosyasının hot-reload (çalışırken yeniden yükleme) desteği
- Kural state'inin disk üzerinde kalıcı hale getirilmesi
- Prometheus/OpenMetrics metrik dışa aktarımı
- Web tabanlı konfigürasyon arayüzü

---

## Açık Sorular

| # | Soru | Durum |
|---|---|---|
| 1 | `SCALE` aksiyonu için hedef replica sayısı `Rule`'da mı tutulacak, yoksa ayrı bir alanda mı? | Açık |
| 2 | Birden fazla kural aynı anda tetiklenirse aksiyon sıralaması nasıl olacak? | Açık |
| 3 | `AnomalyEvent`'lerin `stdout`'a ek olarak ayrı bir dosyaya da yazılması gerekiyor mu? | Açık |
| 4 | Standalone modda ağ metriklerinin `gopsutil` ile toplanıp rule engine'e beslenmesi planlanıyor mu? | Açık |

---

## Değişiklik Geçmişi

| Tarih | Sürüm | Açıklama |
|---|---|---|
| 2025 | 0.1 | İlk taslak |
