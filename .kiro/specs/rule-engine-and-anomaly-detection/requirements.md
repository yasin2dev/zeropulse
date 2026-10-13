# Requirements Document

## Introduction

Bu doküman, Zeropulse ajanına eklenecek olan **kural motoru (Rule Engine)** ve **anomali tespit (Anomaly Detection)** özelliğinin gereksinimlerini tanımlar.

Zeropulse, şu anda Docker ve Standalone Linux/FreeBSD ortamlarından her 5 saniyede bir metrik toplayıp JSON olarak `stdout`'a yazan bir Go ajanıdır. Toplanan metrikler arasında CPU kullanımı, bellek kullanımı, CPU throttling ve ağ I/O bulunmaktadır. Bu metrikler şu an yalnızca ham veri olarak dışa aktarılmakta; herhangi bir eşik kontrolü veya anomali değerlendirmesi yapılmamaktadır.

Bu özellik, kullanıcıların YAML/JSON tabanlı bir konfigürasyon dosyasıyla kurallar tanımlamasına olanak tanıyacak; kural motoru bu kuralları gelen metrik akışına karşı sürekli değerlendirecek ve anormallik tespit ettiğinde `AnomalyEvent` üretecektir. Önerilen aksiyonlar (RESTART, NOTIFY, SCALE) dry-run modunda yalnızca loglanacak, remediation modunda ise gerçekten uygulanacaktır.

---

## Glossary

- **Rule**: Bir metrik tipi, karşılaştırma operatörü, eşik değeri ve ardışık tetiklenme sayısından oluşan değerlendirme birimi.
- **RuleEngine**: Gelen `CollectorSnapshot`'ları alıp yapılandırılmış kurallar listesine karşı değerlendiren ve `AnomalyEvent` üreten bileşen.
- **AnomalyEvent**: Bir kuralın ihlal edildiği an üretilen, zaman damgası, konteyner kimliği, tetiklenen kural adı, güncel metrik değeri ve önerilen aksiyon içeren yapılandırılmış olay kaydı.
- **CooldownTracker**: Aynı kural-konteyner çifti için belirli bir süre içinde tekrar tetiklenmeyi engelleyen durum yönetim bileşeni.
- **StateTracker**: Her kural-konteyner çifti için "ardışık kaç periyot eşik aşıldı" bilgisini bellekte tutan bileşen.
- **Operator**: Metrik değeri ile eşik değerini karşılaştırmak için kullanılan operatör; `GT` (büyüktür) veya `GTE` (büyük eşittir).
- **Action**: Anomali tespit edildiğinde önerilen veya uygulanan aksiyon; `RESTART`, `NOTIFY` veya `SCALE`.
- **Dry-run Modu**: Aksiyonların yalnızca loglandığı, gerçekte uygulanmadığı çalışma modu.
- **Remediation Modu**: Önerilen aksiyonların gerçekten uygulandığı çalışma modu.
- **Flapping**: Bir konteynerin kısa süre içinde defalarca kuralı ihlal edip kurtulmasıyla oluşan sürekli tetiklenme durumu.
- **CollectorSnapshot**: Zeropulse ajanının bir toplama döngüsünde ürettiği `DockerMetricsSnapshot` veya `StandaloneSnapshot` yapısı.
- **MetricType**: Bir kuralın izlediği metrik kategorisi; `CPU_PERCENT`, `MEM_PERCENT`, `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES`.
- **ConsecutivePeriods**: Bir kuralın anomali üretebilmesi için eşiğin kaç ardışık periyot boyunca aşılması gerektiğini belirten sayı.

---

## Requirements

---

### Gereksinim 1: Kural Veri Modeli

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, her konteynere uygulanacak kaynak eşiklerini, kod değiştirmeden yapılandırma dosyasıyla tanımlamak istiyorum; böylece izleme politikalarını yeniden derleme yapmadan güncelleyebilirim.

#### Kabul Kriterleri

1. THE `Rule` SHALL aşağıdaki alanları içermelidir: `Name` (string), `MetricType` (enum: `CPU_PERCENT`, `MEM_PERCENT`, `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES`), `Operator` (enum: `GT`, `GTE`), `Threshold` (float64), `ConsecutivePeriods` (int, minimum 1), `Action` (enum: `RESTART`, `NOTIFY`, `SCALE`), `CooldownSeconds` (int, minimum 0).
2. WHEN `ConsecutivePeriods` alanına 1'den küçük bir değer atanır, THE `Rule` SHALL geçersiz olarak işaretlenmeli ve bir doğrulama hatası döndürmelidir.
3. WHEN `CooldownSeconds` alanına negatif bir değer atanır, THE `Rule` SHALL geçersiz olarak işaretlenmeli ve bir doğrulama hatası döndürmelidir.
4. WHEN `Threshold` alanına negatif bir değer atanır, THE `Rule` SHALL geçersiz olarak işaretlenmeli ve bir doğrulama hatası döndürmelidir.
5. THE `Rule` SHALL `ContainerFilter` alanını desteklemelidir; bu alan boş bırakıldığında kural tüm konteynerlere uygulanmalıdır.
6. WHERE `ContainerFilter` alanı doldurulmuş, THE `Rule` SHALL yalnızca adı bu filtre ile eşleşen konteynerlere uygulanmalıdır.

---

### Gereksinim 2: Anomali Olay Veri Modeli

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, hangi konteyner üzerinde hangi kuralın ne zaman ihlal edildiğini ve ne yapılması önerildiğini gösteren yapılandırılmış bir olay kaydı görmek istiyorum; böylece anomalileri denetleyebilir ve geçmişe dönük inceleyebilirim.

#### Kabul Kriterleri

1. THE `AnomalyEvent` SHALL aşağıdaki alanları içermelidir: `Timestamp` (time.Time, UTC), `ContainerID` (string), `ContainerName` (string), `RuleName` (string), `MetricType` (string), `CurrentValue` (float64), `Threshold` (float64), `ConsecutiveCount` (int), `Action` (string), `DryRun` (bool).
2. WHEN bir kural ihlali tespit edilir, THE `RuleEngine` SHALL bir `AnomalyEvent` üretmeli ve bu olayı yapılandırılmış JSON formatında `stdout`'a yazmalıdır.
3. THE `AnomalyEvent` SHALL mevcut metrik toplamasından bağımsız olarak ayrı bir JSON satırı olarak yazılmalıdır; metrik snapshot'larıyla karışmamalıdır.
4. WHEN `DryRun` alanı `true`, THE `AnomalyEvent` SHALL `"mode": "dry-run"` etiketini içermelidir.
5. WHEN `DryRun` alanı `false`, THE `AnomalyEvent` SHALL `"mode": "remediation"` etiketini içermelidir.

---

### Gereksinim 3: Durum Takipçisi (StateTracker)

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, kural motorunun anlık aşımlar yerine yalnızca **ardışık** birden fazla periyot boyunca eşiği aşan konteynerleri anomali olarak raporlamasını istiyorum; böylece geçici spike'lardan kaynaklanan yanlış alarmları önleyebilirim.

#### Kabul Kriterleri

1. THE `StateTracker` SHALL her `(RuleName, ContainerID)` çifti için ardışık eşik aşım sayısını bellekte tutmalıdır.
2. WHEN bir periyotta metrik değeri eşiği geçmez, THE `StateTracker` SHALL ilgili `(RuleName, ContainerID)` çiftinin sayacını sıfırlamalıdır.
3. WHEN ardışık aşım sayısı kuralın `ConsecutivePeriods` değerine eşit veya büyük olur, THE `StateTracker` SHALL kural motoruna tetikleme sinyali göndermelidir.
4. THE `StateTracker` SHALL artık mevcut olmayan konteynerler için bellekteki durumu temizlemelidir.
5. WHEN ajan yeniden başlatılır, THE `StateTracker` SHALL durum bilgisini başlangıç değerleriyle (sıfır sayaçlarla) başlatmalıdır.

---

### Gereksinim 4: Cooldown Takipçisi (CooldownTracker)

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, kısa süre içinde sürekli tetiklenen flapping durumlarının önüne geçmek istiyorum; aynı konteyner için aynı kural belirli bir süre geçmeden tekrar aksiyon tetiklememelidir.

#### Kabul Kriterleri

1. THE `CooldownTracker` SHALL her `(RuleName, ContainerID)` çifti için son aksiyon zamanını bellekte tutmalıdır.
2. WHEN bir kural tetiklenir ve `CooldownSeconds` değeri sıfırdan büyükse, THE `CooldownTracker` SHALL son tetiklenme zamanından bu yana geçen süreyi kontrol etmelidir.
3. WHEN son tetiklenme üzerinden `CooldownSeconds` süresi geçmemiş, THE `RuleEngine` SHALL aksiyonu atlamalı ve bir `AnomalyEvent` üretmemelidir.
4. WHEN `CooldownSeconds` değeri sıfır, THE `CooldownTracker` SHALL hiçbir kısıtlama uygulamadan her periyotta tetiklemeye izin vermelidir.
5. THE `CooldownTracker` SHALL artık mevcut olmayan konteynerler için cooldown kayıtlarını temizlemelidir.

---

### Gereksinim 5: Kural Motoru Değerlendirme Yaşam Döngüsü

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, her metrik toplama döngüsünün ardından kuralların otomatik olarak değerlendirilmesini istiyorum; böylece herhangi bir manuel tetikle gerek kalmadan sürekli izleme yapılsın.

#### Kabul Kriterleri

1. WHEN `CollectDockerMetrics` yeni bir `DockerMetricsSnapshot` döndürür, THE `RuleEngine` SHALL tüm yapılandırılmış kuralları bu snapshot'taki her `ContainerMetrics` için değerlendirmelidir.
2. THE `RuleEngine` SHALL kural değerlendirmesini metrik toplama döngüsüyle senkron olarak, aynı goroutine üzerinde çalıştırmalıdır.
3. WHEN `RuleEngine.Evaluate` çağrılır, THE `RuleEngine` SHALL önce `StateTracker`'ı güncellemeli, ardından `CooldownTracker`'ı kontrol etmeli, son olarak gerektiğinde `AnomalyEvent` üretmelidir.
4. IF `RuleEngine` bir kural değerlendirmesi sırasında panic ile karşılaşır, THEN THE `RuleEngine` SHALL bu panik'i recover ederek hata logunu `stderr`'e yazmalı ve diğer kuralların değerlendirmesine devam etmelidir.
5. THE `RuleEngine` SHALL değerlendirme döngüsü boyunca hiçbir harici I/O (disk, ağ) çağrısı yapmamalıdır; tüm durum bilgisi bellekte tutulmalıdır.

---

### Gereksinim 6: Metrik Tipi Eşleme

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, konfigürasyon dosyasında belirttiğim metrik tipinin doğru `ContainerMetrics` alanıyla eşleştirilmesini istiyorum; böylece yanlış alan adı yazmaktan kaynaklanan sessiz hatalar oluşmasın.

#### Kabul Kriterleri

1. WHEN bir kural `CPU_PERCENT` metrik tipini tanımlar, THE `RuleEngine` SHALL bu kuralı `ContainerMetrics.CPUPercent` alanıyla değerlendirmelidir.
2. WHEN bir kural `MEM_PERCENT` metrik tipini tanımlar, THE `RuleEngine` SHALL bu kuralı `ContainerMetrics.MemPercent` alanıyla değerlendirmelidir.
3. WHEN bir kural `CPU_THROTTLED_PERIODS` metrik tipini tanımlar, THE `RuleEngine` SHALL bu kuralı `ContainerMetrics.CPUThrottledPeriods` alanıyla değerlendirmelidir.
4. WHEN bir kural `NET_RX_BYTES` metrik tipini tanımlar, THE `RuleEngine` SHALL bu kuralı `ContainerMetrics.NetRxBytes` alanıyla değerlendirmelidir.
5. WHEN bir kural `NET_TX_BYTES` metrik tipini tanımlar, THE `RuleEngine` SHALL bu kuralı `ContainerMetrics.NetTxBytes` alanıyla değerlendirmelidir.
6. WHEN bir kural tanımlanmamış bir metrik tipi içerir, THE `RuleEngine` SHALL başlangıçta yapılandırma doğrulama hatası üretmeli ve o kuralı değerlendirme dışı bırakmalıdır.

---

### Gereksinim 7: Konfigürasyon Yükleme ve Doğrulama

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, ajan başladığında konfigürasyon dosyasının otomatik olarak yüklenmesini ve geçersiz kuralların reddedilerek net hata mesajı gösterilmesini istiyorum; böylece yanlış yapılandırmalar sessizce görmezden gelinmesin.

#### Kabul Kriterleri

1. THE `ConfigLoader` SHALL YAML ve JSON formatlarında yazılmış konfigürasyon dosyalarını desteklemelidir.
2. WHEN ajan `--config <dosya>` argümanıyla başlatılır, THE `ConfigLoader` SHALL belirtilen dosyayı yüklemeli ve kurallara ayrıştırmalıdır.
3. IF konfigürasyon dosyası bulunamazsa, THEN THE `ConfigLoader` SHALL hata mesajını `stderr`'e yazmalı ve ajanı sıfır olmayan bir çıkış kodu ile sonlandırmalıdır.
4. IF konfigürasyon dosyası ayrıştırılamıyorsa (geçersiz YAML/JSON), THEN THE `ConfigLoader` SHALL hatalı satır ve alan bilgisini içeren bir hata mesajını `stderr`'e yazmalı ve ajanı sıfır olmayan bir çıkış kodu ile sonlandırmalıdır.
5. WHEN konfigürasyon dosyası geçerli ancak içinde hatalı tanımlı kurallar varsa, THE `ConfigLoader` SHALL geçersiz kuralları atlayarak uyarı logunu `stderr`'e yazmalı, geçerli kurallarla devam etmelidir.
6. WHEN konfigürasyon dosyası sıfır geçerli kural içeriyorsa, THE `RuleEngine` SHALL değerlendirme döngüsünü çalıştırmadan uyarı logunu yazmalı ve metrik toplamaya devam etmelidir.

---

### Gereksinim 8: Dry-run ve Remediation Modları

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, kural motorunu önce dry-run modunda çalıştırmak istiyorum; böylece gerçek bir aksiyon tetiklenmeden aksiyonları değerlendirebilir ve güven oluşturulunca remediation moduna geçebilirim.

#### Kabul Kriterleri

1. WHEN ajan `--dry-run` bayrağıyla başlatılır, THE `RuleEngine` SHALL tüm aksiyonları yalnızca loglamalı ve hiçbirini gerçekte uygulamamalıdır.
2. WHEN dry-run modunda bir `AnomalyEvent` üretilir, THE `RuleEngine` SHALL olayın `DryRun` alanını `true` olarak işaretlemelidir.
3. WHEN ajan `--dry-run` bayrağı olmadan başlatılır, THE `RuleEngine` SHALL remediation modunda çalışmalı ve `DryRun` alanını `false` olarak işaretlemelidir.
4. THE `RuleEngine` SHALL çalışma modunu (dry-run / remediation) başlangıçta `stderr`'e yapılandırılmış log olarak yazmalıdır.
5. WHILE dry-run modunda çalışırken, THE `RuleEngine` SHALL Docker API'ye hiçbir yazma isteği (container restart, stop, vb.) göndermemelidir.

---

### Gereksinim 9: Standalone Ortam Desteği

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, ajanın Docker olmayan (bare-metal/VM) ortamlarda da kural değerlendirmesi yapmasını istiyorum; böylece host seviyesindeki anomaliler de tespit edilebilsin.

#### Kabul Kriterleri

1. WHEN ajan `standalone` modunda çalışır, THE `RuleEngine` SHALL `StandaloneSnapshot`'taki `CPU` ve `Memory` alanlarını kural değerlendirmesi için kullanmalıdır.
2. WHEN standalone modda kural değerlendirmesi yapılır, THE `AnomalyEvent` SHALL `ContainerID` alanı yerine `"host"` sabit değerini ve `ContainerName` alanı yerine `hostname`'i kullanmalıdır.
3. WHEN standalone modda `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES` veya `NET_TX_BYTES` metrik tipi kullanan bir kural yapılandırılmışsa, THE `ConfigLoader` SHALL bu kurala karşı uyarı logu yazmalı ve standalone modda o kuralı değerlendirme dışı bırakmalıdır.

---

### Gereksinim 10: Parser ve Serileştirme (Konfigürasyon Okuma/Yazma)

**Kullanıcı Hikayesi:** Bir platform operatörü olarak, kural konfigürasyonunu YAML veya JSON olarak yazabilmek ve ajan her iki formatı da hatasız okuyabilmek istiyorum.

#### Kabul Kriterleri

1. WHEN geçerli bir YAML konfigürasyon dosyası sağlanır, THE `ConfigParser` SHALL dosyayı eksiksiz olarak `[]Rule` yapısına ayrıştırmalıdır.
2. WHEN geçerli bir JSON konfigürasyon dosyası sağlanır, THE `ConfigParser` SHALL dosyayı eksiksiz olarak `[]Rule` yapısına ayrıştırmalıdır.
3. THE `ConfigSerializer` SHALL `[]Rule` yapısını geçerli bir YAML dosyasına serileştirmelidir.
4. FOR ALL geçerli `[]Rule` yapıları, `[]Rule`'u YAML'a serileştirip geri ayrıştırmak eşdeğer bir `[]Rule` yapısı üretmelidir (round-trip özelliği).
5. WHEN geçersiz bir YAML/JSON dosyası sağlanır, THE `ConfigParser` SHALL ayrıştırma hatası döndürmeli ve hiçbir `Rule` üretmemelidir.

---

## Örnek Konfigürasyon Şeması

Aşağıda kullanıcının kural tanımlamak için kullanacağı YAML konfigürasyon dosyasının referans şeması ve örneği verilmiştir.

```yaml
# zeropulse-rules.yaml
# Kural motoru konfigürasyonu — Zeropulse Agent

rules:
  - name: "high-cpu-alert"
    metric_type: "CPU_PERCENT"
    operator: "GTE"
    threshold: 85.0
    consecutive_periods: 3
    action: "NOTIFY"
    cooldown_seconds: 60
    container_filter: ""          # boş = tüm konteynerler

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

  - name: "network-rx-spike"
    metric_type: "NET_RX_BYTES"
    operator: "GT"
    threshold: 104857600   # 100 MB
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 30
    container_filter: ""
```

### Alan Açıklamaları

| Alan | Tür | Zorunlu | Açıklama |
|---|---|---|---|
| `name` | string | Evet | Kural için benzersiz tanımlayıcı |
| `metric_type` | enum | Evet | `CPU_PERCENT`, `MEM_PERCENT`, `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES` |
| `operator` | enum | Evet | `GT` (>), `GTE` (>=) |
| `threshold` | float64 | Evet | Eşik değeri (negatif olamaz) |
| `consecutive_periods` | int | Evet | Minimum: 1 |
| `action` | enum | Evet | `RESTART`, `NOTIFY`, `SCALE` |
| `cooldown_seconds` | int | Hayır | Varsayılan: 0 (kısıtlama yok) |
| `container_filter` | string | Hayır | Boş = tüm konteynerler |

---

## Örnek AnomalyEvent Çıktısı

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
