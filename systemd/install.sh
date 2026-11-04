#!/usr/bin/env bash
set -e

# Renkler
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Root yetkisi kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Hata: Bu betik root yetkisiyle (sudo) çalıştırılmalıdır.${NC}"
  echo -e "Derleyip kurmak için sudo olmadan: make install"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARY_SOURCE="$PROJECT_ROOT/bin/zeropulse"
TARGET_BINARY="/usr/local/bin/zeropulse"
SERVICE_NAME="zeropulse.service"

# Kurulum veya Güncelleme modunu tespit et
IS_UPDATE=false
if systemctl is-active --quiet "$SERVICE_NAME" || [ -f "$TARGET_BINARY" ]; then
  IS_UPDATE=true
fi

if [ "$IS_UPDATE" = true ]; then
  echo -e "${YELLOW}=== Zeropulse Güncelleme Modu (Update) ===${NC}"
  echo -e "Mevcut kurulum tespit edildi. Sıfır kesinti hedefiyle güncelleniyor..."
else
  echo -e "${BLUE}=== Zeropulse Yeni Kurulum (Install) ===${NC}"
fi

# 1. Binary Kontrolü (root ortamında go ve npm bulunmayabilir, bu yüzden burada derlenmez)
if [ ! -f "$BINARY_SOURCE" ]; then
  echo -e "${RED}Hata: $BINARY_SOURCE bulunamadı.${NC}"
  echo -e "Derleyip kurmak için sudo olmadan: make install"
  exit 1
fi

# 2. Mevcut Binary'yi Yedekle ve Yenisini Yükle
if [ -f "$TARGET_BINARY" ]; then
  echo -e "${BLUE}▶ Mevcut binary yedekleniyor (/usr/local/bin/zeropulse.old)...${NC}"
  cp "$TARGET_BINARY" "${TARGET_BINARY}.old"
fi

echo -e "${BLUE}▶ Yeni binary ${TARGET_BINARY} konumuna kopyalanıyor...${NC}"
install -m 755 "$BINARY_SOURCE" "$TARGET_BINARY"

# 3. Konfigürasyon ve Veritabanı Dizin Koruması
mkdir -p /etc/zeropulse /var/lib/zeropulse
chmod 750 /var/lib/zeropulse
if [ ! -f /etc/zeropulse/zeropulse.env ]; then
  echo -e "${BLUE}▶ Varsayılan konfigürasyon dosyası oluşturuluyor...${NC}"
  cp "$SCRIPT_DIR/zeropulse.env" /etc/zeropulse/zeropulse.env
  chmod 600 /etc/zeropulse/zeropulse.env
  echo -e "${GREEN}✓ /etc/zeropulse/zeropulse.env oluşturuldu.${NC}"
else
  echo -e "${GREEN}✓ Mevcut /etc/zeropulse/zeropulse.env korundu (üzerine yazılmadı):${NC}"
  grep -E '^ZEROPULSE_(LISTEN_ADDR|DRY_RUN)=' /etc/zeropulse/zeropulse.env || true
fi

if [ ! -f /etc/zeropulse/rules.yaml ] && [ ! -f /etc/zeropulse/rules.json ]; then
  if [ -f "$PROJECT_ROOT/rules.yaml" ]; then
    echo -e "${BLUE}▶ Varsayılan kural dosyası oluşturuluyor (/etc/zeropulse/rules.yaml)...${NC}"
    cp "$PROJECT_ROOT/rules.yaml" /etc/zeropulse/rules.yaml
    chmod 644 /etc/zeropulse/rules.yaml
    echo -e "${GREEN}✓ /etc/zeropulse/rules.yaml oluşturuldu.${NC}"
  fi
fi

# 4. systemd Servis Dosyasını Güncelle
echo -e "${BLUE}▶ systemd servis tanımı güncelleniyor...${NC}"
cp "$SCRIPT_DIR/zeropulse.service" /etc/systemd/system/zeropulse.service
chmod 644 /etc/systemd/system/zeropulse.service

# 5. systemd Yenileme ve Servis Başlatma / Yeniden Başlatma
echo -e "${BLUE}▶ systemd servisleri yenileniyor...${NC}"
systemctl daemon-reload

if [ "$IS_UPDATE" = true ]; then
  echo -e "${BLUE}▶ Zeropulse servisi yeni binary ile yeniden başlatılıyor (restart)...${NC}"
  systemctl restart "$SERVICE_NAME"
else
  echo -e "${BLUE}▶ Zeropulse servisi etkinleştiriliyor ve başlatılıyor...${NC}"
  systemctl enable --now "$SERVICE_NAME"
fi

# 6. Sağlık Doğrulaması (Verification)
sleep 1
if systemctl is-active --quiet "$SERVICE_NAME"; then
  VERSION_INFO=$($TARGET_BINARY --version 2>/dev/null || echo "v0.2.0")
  echo ""
  echo -e "${GREEN}====================================================${NC}"
  if [ "$IS_UPDATE" = true ]; then
    echo -e "${GREEN}✓ Zeropulse Başarıyla Güncellendi! ($VERSION_INFO)${NC}"
  else
    echo -e "${GREEN}✓ Zeropulse Başarıyla Kuruldu! ($VERSION_INFO)${NC}"
  fi
  echo -e "${GREEN}====================================================${NC}"
  echo -e "Durum:      ${GREEN}Çalışıyor (Active)${NC}"
  echo -e "Web Paneli: http://localhost:8080"
  if [ "$IS_UPDATE" = false ]; then
    echo -e "Kurulum anahtarı: journalctl -u zeropulse | grep setup_token"
  fi
  echo -e "Log Takibi: journalctl -u $SERVICE_NAME -f"
else
  echo -e "${RED}UYARI: Servis başlatılamadı. journalctl -u $SERVICE_NAME -n 50 ile logları inceleyin.${NC}"
  exit 1
fi
