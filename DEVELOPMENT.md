# Zeropulse — Geliştirme ve Test Kılavuzu (Development & Testing Guide)

Bu doküman; Zeropulse Ajanı (`zeropulse-agent`), Edge Yönetim Paneli (`ui/`) ve kural motorunu yerel geliştirme (development) ortamında ayağa kaldırmak, API uç noktalarını doğrulamak, yapay stres testleri üretmek ve otomatik testleri koşturmak için adım adım rehberlik sağlar.

---

## İçindekiler

1. [Ön Gereksinimler](#1-ön-gereksinimler)
2. [Hızlı Başlangıç (Quickstart)](#2-hızlı-başlangıç-quickstart)
   - [Seçenek A: Tek Bağımsız Binary Olarak Çalıştırma (Go Embed UI)](#seçenek-a-tek-bağımsız-binary-olarak-çalıştırma-go-embed-ui)
   - [Seçenek B: Linux systemd Servisi Olarak Entegrasyon (Önerilen Host Mimarisi)](#seçenek-b-linux-systemd-servisi-olarak-entegrasyon-önerilen-host-mimarisi)
   - [Seçenek C: PM2 Süreç Yöneticisi ile Çalıştırma](#seçenek-c-pm2-süreç-yöneticisi-ile-çalıştırma)
   - [Seçenek D: Lokal Hibrit Geliştirme (Go Ajanı + Vite Hot-Reload)](#seçenek-d-lokal-hibrit-geliştirme-go-ajanı--vite-hot-reload)
   - [Seçenek E: Docker Compose ile Dağıtım (Opsiyonel)](#seçenek-e-docker-compose-ile-dağıtım-opsiyonel)
3. [REST API ve SSE Akışını Test Etme (cURL & CLI)](#3-rest-api-ve-sse-akışını-test-etme-curl--cli)
4. [Anomali ve Stres Testi Simülasyonu](#4-anomali-ve-stres-testi-simülasyonu)
5. [Kimlik Doğrulama (Auth) Testleri](#5-kimlik-doğrulama-auth-testleri)
6. [Otomatik Testlerin Çalıştırılması (CI/CD Kontrolleri)](#6-otomatik-testlerin-çalıştırılması-cicd-kontrolleri)
7. [Çevre Değişkenleri ve Konfigürasyon Tablosu](#7-çevre-değişkenleri-ve-konfigürasyon-tablosu)
8. [Sık Karşılaşılan Sorunlar ve Çözümleri (Troubleshooting)](#8-sık-karşılaşılan-sorunlar-ve-çözümleri-troubleshooting)

---

## 1. Ön Gereksinimler

Lokal geliştirme ve testler için makinenizde aşağıdaki araçların kurulu olması tavsiye edilir:

- **Go:** `v1.22` veya üzeri (`go version`)
- **Node.js & npm:** Node `v18+` / `v20+` ve npm `v9+` (`node -v`, `npm -v`)
- **Docker & Docker Compose:** Docker `v24+` (`docker compose version`)
- **cURL:** Terminal üzerinden HTTP ve SSE akışlarını test etmek için

---

## 2. Hızlı Başlangıç (Quickstart)

### Seçenek A: Tek Bağımsız Binary Olarak Çalıştırma (Go Embed UI)

Zeropulse, Go'nun `//go:embed` özelliği sayesinde derlenmiş Edge Dashboard'u doğrudan binary'nin içine gömer. Harici Nginx veya web sunucusu gerektirmez.

```bash
# 1. UI ve Go Ajanını tek seferde derleyin
make build

# 2. Ajanı başlatın (Web UI ve API :8080 portunda açılır)
./bin/zeropulse --dry-run
```

Tarayıcınızdan yönetim paneline erişin:
👉 **`http://localhost:8080`**

---

### Seçenek B: Linux systemd Servisi Olarak Entegrasyon (Önerilen Host Mimarisi)

Ajanın Docker çöküşlerinden etkilenmeden işletim sistemi düzeyinde bir daemon olarak çalışması için:

```bash
# Otomatik kurulum betiğini çalıştırın (root yetkisi gereklidir)
sudo ./systemd/install.sh
# veya
sudo make install
```

Bu betik:
- `zeropulse` binary'sini `/usr/local/bin/zeropulse` konumuna yükler.
- `/etc/zeropulse/zeropulse.env` konfigürasyon dosyasını hazırlar (varsa mevcut ayarlarınızı korur).
- `/etc/systemd/system/zeropulse.service` dosyasını kurup servisi başlatır.

**Güncelleme (Mevcut Kurulumu Güncelleme):**
Kodda veya UI'da değişiklik yaptıktan sonra çalışan servisi tek komutla güncellemek için:
```bash
sudo ./systemd/update.sh
# veya
sudo make update
```
*Bu komut projeyi yeniden derler, eski binary'yi `.old` olarak yedekler, mevcut ayarlarınızı (`/etc/zeropulse/zeropulse.env`) korur ve çalışan servisi kesintisizce yeniden başlatır.*

**Servis Yönetim Komutları:**
```bash
# Durumu kontrol et
systemctl status zeropulse.service

# Canlı logları izle
journalctl -u zeropulse.service -f

# Yeniden başlat veya durdur
sudo systemctl restart zeropulse.service
sudo systemctl stop zeropulse.service

# Tamamen kaldırmak (Uninstall) için:
sudo ./systemd/uninstall.sh
```

---

### Seçenek C: PM2 Süreç Yöneticisi ile Çalıştırma

Node.js ve PM2 kurulu ortamlarda:

```bash
# 1. Binary'yi derleyin
make build

# 2. PM2 ile başlatın
pm2 start ecosystem.config.js

# Durum ve loglar
pm2 status
pm2 logs zeropulse
```

---

### Seçenek D: Canlı Front-End Geliştirme (Real-Time Vite HMR + Backend Proxy)

Frontend arayüzünde React bileşenleri, stil veya tasarım geliştirirken her değişiklikte `make build` ve `install.sh` çalıştırmak **gerekmez**. Anında tarayıcıda görmek (Hot Module Replacement — HMR) için:

#### Tek Komutla Canlı Geliştirme (Önerilen)
```bash
make dev
# veya
npm run dev
```
Bu akıllı betik:
1. Arka planda çalışan bir Zeropulse ajanı (`zeropulse.service` veya `:8080`) olup olmadığını kontrol eder.
2. Servis zaten çalışıyorsa doğrudan ona bağlanır; çalışmıyorsa yerel Go ajanını (`--dry-run`) otomatik başlatır.
3. Vite geliştirme sunucusunu **`http://localhost:3000`** adresinde ayağa kaldırır.
4. `ui/src/` içerisindeki herhangi bir `.tsx` veya `.css` dosyasını kaydettiğiniz anda tarayıcı sayfa yenilenmeden **milisaniyeler içinde** güncellenir.
5. Tüm `/api/...` istekleri ve SSE (`/api/v1/stream`) akışları şeffaf bir şekilde Go backend servisine yönlendirilir (proxy).

#### Alternatif Komutlar
- **Sadece Vite UI sunucusu:**
  ```bash
  make ui-dev   # veya cd ui && npm run dev
  ```
  Tarayıcı: `http://localhost:3000`

- **Go Ajanından Vite'a Ters Proxy (Port 8080 üzerinden HMR):**
  Doğrudan Go ajanının portunu (`:8080`) kullanmak istiyorsanız:
  ```bash
  go run ./cmd/agent --dry-run --ui-proxy=http://localhost:3000
  ```

- **Disk Üzerinden Statik Sunma (Embedded Binary Yerine):**
  Derlenmiş UI dosyalarını binary'ye gömmeden disk üzerinden canlı test etmek için:
  ```bash
  go run ./cmd/agent --dry-run --ui-dir=./ui/dist
  ```
  *(Yan terminalde `make ui-watch` çalıştırarak her kod değişiminde `ui/dist` otomatik güncellenebilir).*

> [!NOTE]
> `make build` ve `install.sh` / `make update` komutları yalnızca **production dağıtımları** ve systemd servis ikilisini güncellemek içindir. UI geliştirme döngüsünde yalnızca `make dev` kullanınız.

---

### Seçenek E: Docker Compose ile Dağıtım (Opsiyonel)

Konteyner ortamında çalıştırmak isteyenler için:

```bash
docker compose up --build
```
Durdurmak için: `docker compose down`

---

## 3. REST API ve SSE Akışını Test Etme (cURL & CLI)

Ajan çalışırken (`:9180` veya Vite üzerinden `:8080`), terminalden uç noktaları test edebilirsiniz:

### 1. Sağlık Durumu (Health Check)
```bash
curl -i http://localhost:9180/api/v1/health
```
**Beklenen Yanıt (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-25T12:45:00Z",
  "version": "0.1.0"
}
```

### 2. Canlı Sistem Durumu (Status)
```bash
curl -s http://localhost:9180/api/v1/status | jq .
```

### 3. Gerçek Zamanlı SSE Telemetri Akışı (Server-Sent Events)
Ajanın her 5 saniyede bir gönderdiği metrikleri terminalden canlı olarak dinlemek için:
```bash
curl -N http://localhost:9180/api/v1/stream
```
*Terminalde `event: connected`, her 5 saniyede `event: metrics` ve 15 saniyede bir `event: heartbeat` akışını göreceksiniz.*

### 4. Konteyner Telemetri Listesi
```bash
curl -s http://localhost:9180/api/v1/containers | jq .
```

### 5. Dry-Run Modunu Sorgulama ve Değiştirme
```bash
# Mevcut modu oku
curl -s http://localhost:9180/api/v1/config/dry-run

# Dry-run modunu kapat (Aktif İyileştirme Modu)
curl -X PUT http://localhost:9180/api/v1/config/dry-run \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'

# Tekrar emniyetli Dry-run moduna al
curl -X PUT http://localhost:9180/api/v1/config/dry-run \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

### 6. Manuel Konteyner Yeniden Başlatma (Restart)
```bash
curl -X POST http://localhost:9180/api/v1/containers/<CONTAINER_ID_VEYA_NAME>/restart \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual dev test restart"}'
```

### 7. Olay Günlüğü (Audit Logs)
```bash
curl -s http://localhost:9180/api/v1/audit/logs | jq .
```

---

## 4. Anomali ve Stres Testi Simülasyonu

Kural motorunun ve dashboard'daki kırmızı alarm / stres göstergelerinin çalıştığını gözlemlemek için yapay bir CPU stresi oluşturabilirsiniz.

### Adım 1: Ajanı Düşük CPU Eşiği ile Başlatın
Normalde eşik %80'dir; test için eşiği **%0.5** ve cooldown süresini **10s** olarak verelim:

```bash
go run ./cmd/agent --cpu-threshold 0.5 --cooldown 10s --dry-run
```

### Adım 2: Sonsuz Döngü Çalıştıran Bir Test Konteyneri Ayağa Kaldırın
```bash
docker run -d --name zero-stress-worker alpine sh -c "while true; do :; done"
```

### Adım 3: Dashboard ve Logları İnceleyin
1. **Edge Dashboard (`http://localhost:8080`)**:
   - `zero-stress-worker` satırındaki CPU barı kırmızıya dönecektir.
   - Durum rozeti `CRITICAL` olacaktır.
   - **1 Dk Stres İndeksi** yükselerek `YÜKSEK STRES` veya `KRİTİK STRES` durumuna gelecektir.
   - **Audit & Healing Log** paneline `CPU_SATURATION` uyarısı düşecektir.
2. **Terminal (SSE Akışı)**:
   - `event: anomaly` paketi fırlatılacaktır.

### Adım 4: Test Konteynerini Temizleyin
```bash
docker rm -f zero-stress-worker
```

---

## 5. Kimlik Doğrulama (Auth) Testleri

Edge dashboard'u yetkisiz erişimlere kapatmak istediğinizde Basic Auth veya Bearer Token aktif edilebilir.

### Ajanı Auth Aktif Olarak Başlatın:
```bash
go run ./cmd/agent \
  --auth=true \
  --auth-user="admin" \
  --auth-pass="guclu_parola_123" \
  --api-token="secret-token-xyz"
```

### Testler:
```bash
# 1. Yetkisiz istek (401 Unauthorized döner)
curl -i http://localhost:9180/api/v1/status

# 2. HTTP Basic Auth ile başarılı istek (200 OK döner)
curl -u admin:guclu_parola_123 http://localhost:9180/api/v1/status

# 3. Bearer Token ile başarılı istek (200 OK döner)
curl -H "Authorization: Bearer secret-token-xyz" http://localhost:9180/api/v1/status

# 4. Sağlık kontrolü /health endpoint'i her zaman açıktır (200 OK döner)
curl -i http://localhost:9180/api/v1/health
```

---

## 6. Otomatik Testlerin Çalıştırılması (CI/CD Kontrolleri)

### Go Testleri (Birim & Özellik Tabanlı Rapid Testleri)
```bash
# Tüm paketlerin testlerini koştur
go test -v ./...

# Sadece server ve API testlerini koştur
go test -v ./internal/server/...

# Sadece kural motoru testlerini koştur
go test -v ./internal/engine/...
go test -v ./internal/ruleengine/...

# Test kapsamı (Coverage) raporu al
go test -cover ./...
```

### Frontend (UI) Tip ve Derleme Kontrolleri
```bash
cd ui

# TypeScript derleme ve Vite production paketleme testi
npm run build
```
*Bu komut `tsc -b` ile tip doğrulaması yapar ve `dist/` klasörüne statik varlıkları derler.*

---

## 7. Çevre Değişkenleri ve Konfigürasyon Tablosu

Ajan bayrakları (CLI flags) veya eşdeğer ortam değişkenleri ile yapılandırılabilir:

| CLI Bayrağı | Çevre Değişkeni | Varsayılan | Açıklama |
|---|---|---|---|
| `--listen-addr` | `ZEROPULSE_LISTEN_ADDR` | `0.0.0.0:9180` | Dahili HTTP API ve SSE sunucusunun dinleyeceği adres |
| `--dry-run` | `ZEROPULSE_DRY_RUN` | `false` | `true` ise self-healing aksiyonları sadece simüle edilir |
| `--cpu-threshold` | `ZEROPULSE_CPU_THRESHOLD` | `80.0` | CPU doygunluğu eşik yüzdesi |
| `--mem-threshold` | `ZEROPULSE_MEM_THRESHOLD` | `85.0` | Kritik bellek eşik yüzdesi |
| `--cooldown` | `ZEROPULSE_COOLDOWN` | `60s` | Konteyner başına flapping önleme bekleme süresi |
| `--auth` | `ZEROPULSE_AUTH_ENABLED` | `false` | API ve Web UI için kimlik doğrulamayı zorunlu kılar |
| `--auth-user` | `ZEROPULSE_AUTH_USER` | `admin` | Basic Auth kullanıcı adı |
| `--auth-pass` | `ZEROPULSE_AUTH_PASS` | — | Basic Auth parolası |
| `--api-token` | `ZEROPULSE_API_TOKEN` | — | Otomasyonlar için Bearer API anahtarı |

---

## 8. Sık Karşılaşılan Sorunlar ve Çözümleri (Troubleshooting)

### Sorun: `docker: permission denied while trying to connect to the Docker daemon socket`
**Çözüm:** Kullanıcınız `docker` grubunda olmayabilir.
```bash
sudo usermod -aG docker $USER
newgrp docker
```
Veya geliştirme testlerinde soket izinlerini geçici olarak kontrol edin (`ls -la /var/run/docker.sock`).

### Sorun: `address already in use :8080` veya `:9180`
**Çözüm:** Portu kullanan başka bir proses olabilir:
```bash
# Portu kullanan prosesi tespit edin
lsof -i :8080 || lsof -i :9180

# Farklı bir port ile ajanı başlatın
go run ./cmd/agent --listen-addr 0.0.0.0:9190
```

### Sorun: Vite UI açılıyor fakat metrikler akmıyor (RECONNECTING / OFFLINE)
**Çözüm:** 
1. Go ajanının `:9180` portunda çalıştığından emin olun (`curl http://localhost:9180/api/v1/health`).
2. Tarayıcı Geliştirici Araçları (F12) -> **Network** sekmesinde `/api/v1/stream` isteğinin durumunu kontrol edin.
