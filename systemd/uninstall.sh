#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Hata: Bu betik root yetkisiyle (sudo) çalıştırılmalıdır.${NC}"
  exit 1
fi

echo -e "${BLUE}=== Zeropulse Kaldırma (Uninstall) ===${NC}"

if systemctl is-active --quiet zeropulse.service || systemctl is-enabled --quiet zeropulse.service 2>/dev/null; then
  echo -e "▶ Servis durduruluyor ve devre dışı bırakılıyor..."
  systemctl stop zeropulse.service || true
  systemctl disable zeropulse.service || true
fi

if [ -f /etc/systemd/system/zeropulse.service ]; then
  echo -e "▶ systemd servis tanımı siliniyor..."
  rm -f /etc/systemd/system/zeropulse.service
  systemctl daemon-reload
fi

if [ -f /usr/local/bin/zeropulse ]; then
  echo -e "▶ /usr/local/bin/zeropulse siliniyor..."
  rm -f /usr/local/bin/zeropulse
  rm -f /usr/local/bin/zeropulse.old
fi

echo -e "${GREEN}✓ Zeropulse servisi ve binary'si başarıyla kaldırıldı.${NC}"
echo -e "Not: Ayarlarınızı korumak için /etc/zeropulse dizinine dokunulmadı."
echo -e "Ayarları da tamamen silmek isterseniz: sudo rm -rf /etc/zeropulse"
