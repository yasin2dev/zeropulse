# Zeropulse Agent

Zeropulse, Docker konteynerleri ve Standalone (bare-metal / VM) Linux ve FreeBSD sistemleri için hafif, sıfır harici servis bağımlılığına sahip, gerçek zamanlı telemetri toplayıcı ve anomali tespit kural motorudur.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Derleme (Build)](#derleme-build)
- [Komut Satırı Bayrakları (Flags)](#komut-satırı-bayrakları-flags)
- [Çalışma Modları ve Kullanım Örnekleri](#çalışma-modları-ve-kullanım-örnekleri)
  - [1. Salt Metrik Toplama (Varsayılan)](#1-salt-metrik-toplama-varsayılan)
  - [2. Kural Motoru ile İzleme (Remediation)](#2-kural-motoru-ile-izleme-remediation)
  - [3. Simülasyon Modu (Dry-Run)](#3-simülasyon-modu-dry-run)
- [Kural Konfigürasyonu (YAML / JSON)](#kural-konfigürasyonu-yaml--json)
  - [Kural Alanları ve Doğrulama Kuralları](#kural-alanları-ve-doğrulama-kuralları)
  - [Örnek `rules.yaml`](#örnek-rulesyaml)
  - [Örnek `rules.json`](#örnek-rulesjson)
- [Telemetri ve Olay Çıktı Formatı](#telemetri-ve-olay-çıktı-formatı)
  - [stdout vs stderr Ayrımı](#stdout-vs-stderr-ayrımı)
  - [AnomalyEvent Çıktısı (JSON)](#anomalyevent-çıktısı-json)
- [Testlerin Çalıştırılması](#testlerin-çalıştırılması)

---

## Özellikler

- **Otomatik Ortam Tespiti:** Docker socket veya `/.dockerenv` varlığına göre otomatik olarak Docker veya Standalone moduna geçer.
- **Düşük Kaynak Tüketimi & Sıfır Harici Servis:** Veritabanı veya mesaj kuyruğu gerektirmez; durum ve cooldown takibi tamamen bellek içinde (in-memory) tutulur.
- **Ardışık Eşik Takibi (StateTracker):** Geçici spike'ların (ani sıçramalar) yanlış alarm üretmesini önlemek için ardışık periyot eşik kontrolü yapar.
- **Flapping Önleme (CooldownTracker):** Aynı kural ve konteyner için belirlenen cooldown süresi dolmadan peş peşe alarm/aksiyon tetiklenmesini engeller.
- **Panic İzolasyonu:** Hatalı veya beklenmedik durumdaki bir kuralın motoru çökertmesi engellenir; `recover()` mekanizmasıyla diğer kuralların izlenmesine devam edilir.

---

## Derleme (Build)

Projeyi derlemek için Go 1.22+ gereklidir:

```bash
# Proje kök dizininde iken
go build -o zeropulse ./cmd/agent
```

Derleme sonucunda çalıştırılabilir `zeropulse` binary'si oluşturulur.

---

## Komut Satırı Bayrakları (Flags)

| Bayrak | Tip | Varsayılan | Açıklama |
|---|---|---|---|
| `--config` | `string` | `""` (boş) | Kuralları içeren YAML veya JSON dosyasının yolu. Belirtilmezse kural motoru devre dışı kalır, yalnızca metrik toplanır. |
| `--dry-run` | `bool` | `false` | Dry-run modunu etkinleştirir. Anomali tespit edildiğinde aksiyon uygulanmaz; olay `"mode": "dry-run"` olarak loglanır. |
| `-h`, `--help` | — | — | Kullanılabilir komut satırı seçeneklerini ve açıklamalarını listeler. |

---

## Çalışma Modları ve Kullanım Örnekleri

### 1. Salt Metrik Toplama (Varsayılan)

Herhangi bir bayrak verilmediğinde ajan ortamı tespit eder ve her 5 saniyede bir metrik snapshot'larını `stdout`'a JSON olarak yazar.

```bash
./zeropulse
```

### 2. Kural Motoru ile İzleme (Remediation)

Kural dosyası verilerek çalıştırıldığında hem metrikler toplanır hem de her döngüde kurallar değerlendirilir. Eşik aşıldığında `"mode": "remediation"` etiketiyle `AnomalyEvent` üretilir.

```bash
./zeropulse --config rules.yaml
```

### 3. Simülasyon Modu (Dry-Run)

Üretim ortamında kuralları canlıya almadan önce veya test aşamasında kullanılır. Olaylar üretilir ancak sisteme müdahale edilmez.

```bash
./zeropulse --config rules.yaml --dry-run
```

JSON formatında kural dosyası kullanımı:

```bash
./zeropulse --config /etc/zeropulse/rules.json --dry-run
```

---

## Kural Konfigürasyonu (YAML / JSON)

### Kural Alanları ve Doğrulama Kuralları

| Alan | Tip | Zorunlu | Açıklama / Kabul Edilen Değerler |
|---|---|---|---|
| `name` | string | Evet | Kural adı (boş olamaz). |
| `metric_type` | enum | Evet | `CPU_PERCENT`, `MEM_PERCENT`, `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES` *(Not: Standalone modda yalnızca `CPU_PERCENT` ve `MEM_PERCENT` desteklenir)*. |
| `operator` | enum | Evet | `GT` (büyüktür `>`), `GTE` (büyük eşittir `>=`). |
| `threshold` | float64 | Evet | Karşılaştırma eşik değeri ($\ge 0$). |
| `consecutive_periods` | int | Evet | Anomali üretilmesi için gereken ardışık ihlal sayısı ($\ge 1$). |
| `action` | enum | Evet | Tetiklenecek aksiyon: `NOTIFY`, `RESTART`, `SCALE`. |
| `cooldown_seconds` | int | Hayır | İki tetiklenme arasında geçmesi gereken asgari süre saniye cinsinden ($\ge 0$, varsayılan `0`). |
| `container_filter` | string | Hayır | Hedef konteyner adı. Boş bırakılırsa tüm konteynerlere uygulanır. |

### Örnek `rules.yaml`

```yaml
rules:
  # Tüm konteynerlerde CPU %85 üzerinde ardışık 3 periyot kalırsa uyar
  - name: "high-cpu-alert"
    metric_type: "CPU_PERCENT"
    operator: "GTE"
    threshold: 85.0
    consecutive_periods: 3
    action: "NOTIFY"
    cooldown_seconds: 60
    container_filter: ""

  # Yalnızca 'api-server' isimli konteynerde kritik CPU aşımında yeniden başlat
  - name: "critical-cpu-restart"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 95.0
    consecutive_periods: 2
    action: "RESTART"
    cooldown_seconds: 300
    container_filter: "api-server"

  # Bellek %90 üzerinde 2 periyot kaldığında uyar
  - name: "high-memory-warn"
    metric_type: "MEM_PERCENT"
    operator: "GTE"
    threshold: 90.0
    consecutive_periods: 2
    action: "NOTIFY"
    cooldown_seconds: 120
    container_filter: ""

  # Ağ indirme ani sıçraması (100 MB üzeri)
  - name: "network-rx-spike"
    metric_type: "NET_RX_BYTES"
    operator: "GT"
    threshold: 104857600
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 30
    container_filter: ""
```

### Örnek `rules.json`

```json
{
  "rules": [
    {
      "name": "high-cpu-alert",
      "metric_type": "CPU_PERCENT",
      "operator": "GTE",
      "threshold": 85.0,
      "consecutive_periods": 3,
      "action": "NOTIFY",
      "cooldown_seconds": 60,
      "container_filter": ""
    }
  ]
}
```

---

## Telemetri ve Olay Çıktı Formatı

### stdout vs stderr Ayrımı

Zeropulse UNIX felsefesine uygun olarak veri ve log akışlarını ayırır:
- **`stdout`**: Ham metrik snapshot'ları ve kural ihlallerinde fırlatılan `AnomalyEvent` nesneleri JSON formatında tek satır olarak (JSONL) akar. Pipe (`|`) veya log toplayıcılara doğrudan bağlanabilir:
  ```bash
  ./zeropulse --config rules.yaml | jq .
  ```
- **`stderr`**: Yapılandırılmış operasyonel loglar (`log/slog` formatında; ajan başlangıcı, ortam bilgisi, kural yükleme uyarıları, varsa panik logları).

### AnomalyEvent Çıktısı (JSON)

Bir kural eşiği `consecutive_periods` kadar aşıldığında ve cooldown süresi uygun olduğunda `stdout` akışına şu formatta bir olay nesnesi yazılır:

```json
{
  "timestamp": "2026-10-14T20:45:00.123456789Z",
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

> **Not:** Standalone modda çalışırken `container_id` sabit `"host"` değerini, `container_name` ise makinenin `hostname` değerini alır.

---

## Testlerin Çalıştırılması

Tüm birim, entegrasyon ve property-based testleri (PBT) çalıştırmak için:

```bash
# Tüm testleri çalıştırma
go test ./...

# Önbelleksiz detaylı çalıştırma
go test -v -count=1 ./...
```
