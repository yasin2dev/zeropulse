#!/usr/bin/env bash
set -e

# Renkler
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=== Zeropulse Güncelleme Betiği ===${NC}"

# Root yetkisi kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Hata: Güncelleme root yetkisiyle (sudo) çalıştırılmalıdır.${NC}"
  echo -e "Kullanım: sudo $0"
  exit 1
fi

echo -e "${YELLOW}1. Kaynak kod derleniyor...${NC}"
(cd "$PROJECT_ROOT" && npm --prefix ui run build && go build -ldflags="-s -w" -o bin/zeropulse ./cmd/agent)

echo -e "${YELLOW}2. Servis güncelleniyor...${NC}"
exec "$SCRIPT_DIR/install.sh"
