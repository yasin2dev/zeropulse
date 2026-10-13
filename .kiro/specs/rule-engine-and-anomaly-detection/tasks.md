# Implementation Plan: Rule Engine ve Anomaly Detection

## Overview

Bu plan, Zeropulse ajanına kural motoru (Rule Engine) ve anomali tespit (Anomaly Detection) özelliğini eklemek için gereken kodlama adımlarını kapsar. Uygulama sırası şöyledir: önce `internal/config` paketi (veri modeli + yükleyici), ardından `internal/ruleengine` paketi (durum takibi, cooldown, metrik eşleme, motor), son olarak `cmd/agent/main.go` entegrasyonu ve PBT bağımlılığı eklenir.

Tüm property-based testler `github.com/flyingmutant/rapid` kütüphanesiyle yazılır. Her property testi, tasarım dokümanındaki ilgili property'ye referans veren bir yorum içerir:

```
// Feature: rule-engine-and-anomaly-detection, Property N: <property_text>
```

---

## Tasks

- [x] 1. PBT bağımlılığını ekle ve go.mod/go.sum güncelle
  - `go get github.com/flyingmutant/rapid@latest` çalıştır
  - `go.mod` ve `go.sum` dosyalarının güncellendiğini doğrula
  - _Requirements: (tüm test görevlerinin ön koşulu)_

- [x] 2. `internal/config` paketini oluştur — veri modeli ve doğrulama
  - [x] 2.1 `internal/config/model.go` dosyasını oluştur
    - `MetricType`, `Operator`, `Action` string sabitlerini tanımla (`CPU_PERCENT`, `MEM_PERCENT`, `CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES`; `GT`, `GTE`; `RESTART`, `NOTIFY`, `SCALE`)
    - `Rule` struct'ını tüm alanlarıyla tanımla: `Name`, `MetricType`, `Operator`, `Threshold`, `ConsecutivePeriods`, `Action`, `CooldownSeconds`, `ContainerFilter`
    - `Rule.Validate()` metodunu uygula; `Name` boşluk kontrolü, `MetricType`/`Operator`/`Action` enum doğrulaması, `Threshold >= 0`, `ConsecutivePeriods >= 1`, `CooldownSeconds >= 0` kontrolleri
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x]* 2.2 `internal/config/model.go` için property testleri yaz — `config` paketi
    - **Property 1: Kural Doğrulama — Geçersiz ConsecutivePeriods Reddi** → `TestValidateConsecutivePeriodsInvalid`
    - **Property 2: Kural Doğrulama — Geçersiz CooldownSeconds Reddi** → `TestValidateCooldownSecondsNegative`
    - **Property 3: Kural Doğrulama — Negatif Threshold Reddi** → `TestValidateThresholdNegative`
    - **Property 14: Bilinmeyen MetricType — Doğrulama Hatası** → `TestUnknownMetricTypeValidation`
    - Her test `rapid.Check` ile minimum 100 iterasyon çalıştırır
    - _Requirements: 1.2, 1.3, 1.4, 6.6_

  - [x] 2.3 `internal/config/loader.go` dosyasını oluştur
    - `ConfigLoader` struct'ını tanımla
    - `Load(path string, logger *slog.Logger) ([]Rule, error)` metodunu uygula
    - Uzantıya göre format tespiti (`.yaml`/`.yml` → YAML; `.json` → JSON; diğer → YAML dene)
    - `gopkg.in/yaml.v3` ile YAML, `encoding/json` ile JSON ayrıştırma
    - Her kural için `Rule.Validate()` çağır; geçersiz kuralları uyarıyla atla, geçerli kuralları döndür
    - Dosya bulunamadı / ayrıştırma hatası durumunda `error` döndür
    - Standalone modda desteklenmeyen metrik tiplerini (`CPU_THROTTLED_PERIODS`, `NET_RX_BYTES`, `NET_TX_BYTES`) içeren kuralları uyarıyla filtrele (env parametresiyle)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.3, 10.1, 10.2, 10.5_

  - [x]* 2.4 `internal/config/loader_test.go` için unit testleri yaz
    - Dosya bulunamadı → `error` döner
    - Geçersiz YAML sözdizimi → `error` döner ve hiç `Rule` üretilmez
    - Geçerli YAML → tüm kurallar yüklenir
    - Geçerli JSON → tüm kurallar yüklenir
    - Karma (bazı geçersiz) kurallar → geçerli kurallar yüklenir, geçersizler atlanır
    - Sıfır geçerli kural → boş dilim döner, `error` yok
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 10.1, 10.2, 10.5_

  - [x]* 2.5 `internal/config` paketi için YAML round-trip property testi yaz
    - **Property 15: Konfigürasyon Round-Trip (YAML)** → `TestConfigRoundTripYAML`
    - `rapid` ile rastgele geçerli `[]Rule` oluştur, YAML'a serileştir, geri ayrıştır, eşitliği doğrula
    - _Requirements: 10.3, 10.4_

- [x] 3. Checkpoint — `internal/config` testleri geçiyor mu?
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. `internal/ruleengine` paketini oluştur — temel yapılar
  - [x] 4.1 `internal/ruleengine/event.go` dosyasını oluştur
    - `AnomalyEvent` struct'ını tüm alanlarıyla tanımla: `Timestamp`, `EventType` (sabit `"anomaly"`), `Mode`, `ContainerID`, `ContainerName`, `RuleName`, `MetricType`, `CurrentValue`, `Threshold`, `ConsecutiveCount`, `Action`, `DryRun`
    - `NewAnomalyEvent(...)` yardımcı constructor'ı uygula; `DryRun=true` ise `Mode="dry-run"`, `false` ise `Mode="remediation"` atar
    - _Requirements: 2.1, 2.4, 2.5_

  - [x]* 4.2 `event.go` için property testleri yaz — `ruleengine` paketi
    - **Property 5: AnomalyEvent Zorunlu Alan Bütünlüğü** → `TestAnomalyEventFieldCompleteness`
    - **Property 6: DryRun Modu Etiketi** → `TestDryRunModeLabel`
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 4.3 `internal/ruleengine/state.go` dosyasını oluştur
    - `stateKey` struct'ını tanımla (`RuleName`, `ContainerID`)
    - `StateTracker` struct'ını `counts map[stateKey]int` alanıyla tanımla
    - `NewStateTracker() *StateTracker` constructor'ı uygula
    - `Record(ruleName, containerID string, breach bool) int` metodunu uygula; `breach=true` ise sayacı artır, `false` ise sıfırla, mevcut değeri döndür
    - `Purge(activeContainerIDs map[string]struct{})` metodunu uygula
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 4.4 `state.go` için property testleri yaz
    - **Property 7: StateTracker — Ardışık Sayaç Doğruluğu** → `TestStateTrackerConsecutiveCount`
    - **Property 8: StateTracker — Tetikleme Eşiği** → `TestStateTrackerTriggerThreshold`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x]* 4.5 `state.go` için unit testleri yaz
    - `Purge` sonrası artık aktif olmayan container kayıtları silinir
    - `breach=false` sonrası sayaç sıfırlanır
    - _Requirements: 3.4_

  - [x] 4.6 `internal/ruleengine/cooldown.go` dosyasını oluştur
    - `CooldownTracker` struct'ını `lastFired map[stateKey]time.Time` ve `now func() time.Time` alanlarıyla tanımla
    - `NewCooldownTracker() *CooldownTracker` constructor'ı uygula (`now = time.Now`)
    - `IsAllowed(ruleName, containerID string, cooldownSecs int) bool` metodunu uygula
    - `Record(ruleName, containerID string)` metodunu uygula
    - `Purge(activeContainerIDs map[string]struct{})` metodunu uygula
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 4.7 `cooldown.go` için property testleri yaz
    - **Property 9: CooldownTracker — Cooldown İçinde Atla** → `TestCooldownBlocksWithinWindow`
    - **Property 10: CooldownTracker — Sıfır Cooldown Her Zaman İzin Verir** → `TestZeroCooldownAlwaysAllows`
    - `now` alanını test içinde enjekte ederek zamanı kontrol et
    - _Requirements: 4.2, 4.3_

  - [x]* 4.8 `cooldown.go` için unit testleri yaz
    - Cooldown süresi geçince yeniden izin verir
    - `Purge` sonrası stale kayıtlar temizlenir
    - _Requirements: 4.5_

- [x] 5. Checkpoint — `internal/ruleengine` temel yapılar testleri geçiyor mu?
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. `internal/ruleengine` paketini tamamla — metrik eşleme ve motor
  - [x] 6.1 `internal/ruleengine/metrics.go` dosyasını oluştur
    - `ExtractDockerMetricValue(m collector.ContainerMetrics, mt config.MetricType) (float64, error)` fonksiyonunu uygula; beş bilinen `MetricType` için ilgili alanı döndür, bilinmeyende `error` döndür
    - `ExtractStandaloneMetricValue(snap *collector.StandaloneSnapshot, mt config.MetricType) (float64, error)` fonksiyonunu uygula; `CPU_PERCENT` ve `MEM_PERCENT` için gerekli alanları eşle, desteklenmeyen tipler için `error` döndür
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 6.2 `metrics.go` için property testleri yaz
    - **Property 13: MetricType → Alan Eşleme Doğruluğu** → `TestMetricTypeMapping`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.3 `internal/ruleengine/engine.go` dosyasını oluştur
    - `RuleEngine` struct'ını tanımla: `rules []config.Rule`, `state *StateTracker`, `cooldown *CooldownTracker`, `dryRun bool`, `out io.Writer`, `logger *slog.Logger`
    - `NewRuleEngine(rules []config.Rule, dryRun bool, out io.Writer, logger *slog.Logger) *RuleEngine` constructor'ı uygula
    - `EvaluateDocker(snap *collector.DockerMetricsSnapshot)` metodunu uygula:
      - Her container için `ContainerFilter` kontrolü yap
      - `ExtractDockerMetricValue` ile değer çek
      - `Operator` (`GT`/`GTE`) ile eşik karşılaştırması yap
      - `StateTracker.Record` çağır
      - `count >= ConsecutivePeriods` ise `CooldownTracker.IsAllowed` kontrol et
      - İzin varsa `CooldownTracker.Record` çağır, `AnomalyEvent` oluştur, `out`'a JSON yaz
      - Döngü sonunda `StateTracker.Purge` ve `CooldownTracker.Purge` çağır
      - Her kural değerlendirmesini `recover()` ile panic'ten koru
    - `EvaluateStandalone(snap *collector.StandaloneSnapshot)` metodunu uygula (`ContainerID="host"`, `ContainerName=os.Hostname()`)
    - Başlangıçta çalışma modunu `stderr`'e log olarak yaz
    - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2_

  - [x]* 6.4 `engine.go` için property testleri yaz — `ruleengine` paketi
    - **Property 4: ContainerFilter Eşleşme Davranışı** → `TestContainerFilterMatching`
    - **Property 11: Kural Değerlendirme Kapsamı** → `TestEvaluateAllCombinations`
    - **Property 12: Panic İzolasyonu** → `TestPanicIsolation`
    - _Requirements: 1.5, 1.6, 5.1, 5.4_

  - [x]* 6.5 `engine.go` için unit testleri yaz
    - `GT` vs `GTE` operatörü sınır değerinde farklı davranır
    - `ConsecutivePeriods=1` ile ilk ihlalde anında tetiklenir
    - Cooldown süresi geçince aynı kural yeniden tetiklenir
    - Dry-run modunda `DryRun=true` ve `mode="dry-run"` üretilir
    - Remediation modunda `DryRun=false` ve `mode="remediation"` üretilir
    - Standalone modda `ContainerID="host"` ve `ContainerName=hostname` kullanılır
    - _Requirements: 2.3, 2.4, 2.5, 8.1, 8.2, 8.3, 9.1, 9.2_

- [x] 7. Checkpoint — `internal/ruleengine` tam test süiti geçiyor mu?
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. `cmd/agent/main.go` güncelle — CLI entegrasyonu
  - [x] 8.1 `--config` ve `--dry-run` CLI flag'lerini ekle
    - `flag` paketi ile `--config <dosya>` ve `--dry-run` flag'lerini tanımla
    - `--config` sağlanmışsa `ConfigLoader.Load` çağır; hata durumunda sıfır olmayan exit kodu ile sonlandır
    - `--config` sağlanmamışsa kural motoru oluşturma adımını atla, yalnızca metrik toplamaya devam et
    - `NewRuleEngine` ile `RuleEngine` örneği oluştur (`dryRun` flag'ini aktar, `out=os.Stdout`, `logger=logger`)
    - _Requirements: 7.2, 7.3, 8.1, 8.3, 8.4_

  - [x] 8.2 Docker toplama döngüsüne `RuleEngine.EvaluateDocker` entegre et
    - `collectAndPrintDocker` fonksiyonunu (veya `runDockerLoop` içindeki ilgili yeri) güncelle: her snapshot toplandıktan sonra `engine.EvaluateDocker(snap)` çağır
    - `RuleEngine` yoksa (kural dosyası sağlanmamışsa) bu adımı atla
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.3 Standalone toplama döngüsüne `RuleEngine.EvaluateStandalone` entegre et
    - `collectAndPrintStandalone` fonksiyonunu güncel: her snapshot sonrası `engine.EvaluateStandalone(snap)` çağır
    - `RuleEngine` yoksa bu adımı atla
    - _Requirements: 5.1, 5.2, 5.3, 9.1, 9.2_

  - [x]* 8.4 `cmd/agent/main.go` için integration testleri yaz
    - `--dry-run` bayrağı ile `DryRun=true` event üretildiğini doğrula (mock collector ile)
    - Konfigürasyon dosyası olmadan ajan başlarsa kural değerlendirmesi çalışmaz
    - Standalone modda `ContainerID="host"` event üretilir
    - _Requirements: 5.1, 5.2, 8.1, 8.2, 8.3, 9.1, 9.2_

- [x] 9. Final Checkpoint — tüm testler geçiyor, derleme başarılı
  - `go build ./...` ile derleme hatası olmadığını doğrula
  - `go test ./...` ile tüm test paketlerinin geçtiğini doğrula
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- `*` işaretli görevler isteğe bağlıdır; daha hızlı MVP için atlanabilir, ancak önerilmez.
- Her görev, izlenebilirlik için spesifik gereksinim numaralarına referans verir.
- Property testleri evrensel doğruluğu, unit testler ise belirli örnekleri ve sınır koşullarını doğrular.
- `CooldownTracker.now` alanı test edilebilirlik için enjekte edilebilir tasarlanmıştır; testlerde sanal zaman kullanılır.
- `gopkg.in/yaml.v3` kütüphanesi zaten Go ekosisteminde yaygın; `go get` ile eklenir.
- `github.com/flyingmutant/rapid` PBT kütüphanesi Görev 1'de eklenir; diğer test görevleri buna bağımlıdır.
- `cmd/agent/main.go` değişiklikleri mevcut Docker ve Standalone döngülerini bozmaz; kural motoru olmadan ajan önceki gibi çalışmaya devam eder.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.1", "4.3", "4.6"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.5", "4.7", "4.8", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "6.5", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3"] },
    { "id": 8, "tasks": ["8.4"] }
  ]
}
```
